// The "extract" command: decodes resources from a copied VPK into exact output paths, in one run.
//
//   shader-dump extract --vpk <pak01_dir.vpk | maps/<map>_vanity.vpk> --jobs <jobs.json> --report <report.json>
//
// jobs.json: [{ "kind": "...", "path": "<game path, without _c>", "out": "<file>" }, ...]
//   texture   vtex → PNG, or EXR for float textures (the report gives the file actually written)
//   material  vmat → JSON (shader, ints, floats, vectors, textures, attributes)
//   kv        any KV3 resource (vcompmat, …) → JSON
//   model     vmdl → GLB (geometry and skin only) and <out>.json (skeleton, meshes, draw calls, mesh groups)
//   clip      vnmclip → JSON (skeleton, bones, parents, frames of local position / rotation)
//   skeleton  vnmskel → JSON (bones, parents, local bind position / rotation)
//   entities  vents (a map's entity lump) → text: every entity's key values, as VRF dumps them
//   raw       a plain file (items_game.txt, localization) copied as it is

using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Nodes;
using SteamDatabase.ValvePak;
using ValveKeyValue;
using ValveResourceFormat;
using ValveResourceFormat.IO;
using ValveResourceFormat.ResourceTypes;
using ValveResourceFormat.ResourceTypes.ModelAnimation;
using ValveResourceFormat.ResourceTypes.ModelAnimation2;
using ValveResourceFormat.Serialization.KeyValues;

static class Extract
{
    static readonly JsonSerializerOptions Indented = new() { WriteIndented = false };

    public static void Run(string vpkPath, string jobsPath, string reportPath, Func<string, string> output)
    {
        var jobs = JsonNode.Parse(File.ReadAllText(jobsPath))!.AsArray();
        using var package = new Package();
        package.Read(vpkPath);
        // No file name: the loader searches this package only (no gameinfo.gi lookup, no other folders).
        using var loader = new GameFileLoader(package, null);
        var report = new JsonArray();
        foreach (var job in jobs)
        {
            var kind = (string)job!["kind"]!;
            var path = (string)job["path"]!;
            var outPath = output((string)job["out"]!);
            var entry = new JsonObject { ["kind"] = kind, ["path"] = path };
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
                if (kind == "raw")
                {
                    // A plain file (items_game.txt, localization): its bytes as they are.
                    var raw = package.FindEntry(path) ?? throw new FileNotFoundException("not in the VPK: " + path);
                    package.ReadEntry(raw, out var bytes);
                    File.WriteAllBytes(outPath, bytes);
                    entry["out"] = outPath;
                    report.Add(entry);
                    continue;
                }
                using var resource = loader.LoadFileCompiled(path) ?? throw new FileNotFoundException("not in the VPK: " + path);
                entry["out"] = kind switch
                {
                    "texture" => Texture(resource, loader, outPath),
                    "material" => WriteJson(outPath, Material(resource)),
                    "kv" => WriteJson(outPath, Kv(((BinaryKV3)resource.DataBlock!).Data)),
                    "model" => Model(resource, loader, outPath),
                    "clip" => WriteJson(outPath, Clip(resource, loader)),
                    "skeleton" => WriteJson(outPath, SkeletonJson(Skeleton.FromSkeletonData(((BinaryKV3)resource.DataBlock!).Data))),
                    "entities" => WriteText(outPath, ((EntityLump)resource.DataBlock!).ToEntityDumpString()),
                    _ => throw new ArgumentException("unknown kind " + kind),
                };
            }
            catch (Exception e)
            {
                entry["error"] = e.Message;
                Console.Error.WriteLine($"{kind} {path}: {e.Message}");
            }
            report.Add(entry);
        }
        File.WriteAllText(output(reportPath), report.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"extract: {report.Count} jobs, {report.Count(e => e!["error"] != null)} failed");
    }

    static string WriteText(string path, string text)
    {
        File.WriteAllText(path, text);
        return path;
    }

    static string WriteJson(string path, JsonNode node)
    {
        File.WriteAllText(path, node.ToJsonString(Indented));
        return path;
    }

    /// <summary>The texture as VRF decodes it: PNG, or EXR for float formats (the extension follows the data).</summary>
    static string Texture(Resource resource, IFileLoader loader, string outPath)
    {
        // The image is a sub-file of the extracted content (its Data is the .vtex source description).
        using var content = new TextureExtract(resource).ToContentFile();
        var image = content.SubFiles.FirstOrDefault(s => s.FileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase) || s.FileName.EndsWith(".exr", StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidDataException("no image in the texture");
        var data = image.Extract?.Invoke() ?? throw new InvalidDataException("no image data");
        var isExr = data.Length > 4 && data[0] == 0x76 && data[1] == 0x2f && data[2] == 0x31 && data[3] == 0x01;
        var path = Path.ChangeExtension(outPath, isExr ? ".exr" : ".png");
        File.WriteAllBytes(path, data);
        return path;
    }

    static JsonObject Material(Resource resource)
    {
        var m = (Material)resource.DataBlock!;
        return new JsonObject
        {
            ["shader"] = m.ShaderName,
            ["ints"] = Obj(m.IntParams.Select(p => (p.Key, (JsonNode?)p.Value))),
            ["floats"] = Obj(m.FloatParams.Select(p => (p.Key, (JsonNode?)p.Value))),
            ["vectors"] = Obj(m.VectorParams.Select(p => (p.Key, (JsonNode?)new JsonArray(p.Value.X, p.Value.Y, p.Value.Z, p.Value.W)))),
            ["textures"] = Obj(m.TextureParams.Select(p => (p.Key, (JsonNode?)p.Value))),
            ["attributes"] = Obj(m.StringAttributes.Select(p => (p.Key, (JsonNode?)p.Value))),
            ["intAttributes"] = Obj(m.IntAttributes.Select(p => (p.Key, (JsonNode?)p.Value))),
        };
    }

    static JsonObject Obj(IEnumerable<(string Key, JsonNode? Value)> items)
    {
        var o = new JsonObject();
        foreach (var (k, v) in items) o[k] = v;
        return o;
    }

    /// <summary>A KV3 value as JSON: collections → objects, arrays → arrays, binary blobs → their length.</summary>
    static JsonNode? Kv(KVObject value)
    {
        switch (value.ValueType)
        {
            case KVValueType.Collection:
                {
                    var o = new JsonObject();
                    foreach (var (key, child) in value) o[key] = Kv(child);
                    return o;
                }
            case KVValueType.Array:
                {
                    var a = new JsonArray();
                    foreach (var child in value.AsArraySpan()) a.Add(Kv(child));
                    return a;
                }
            case KVValueType.Null: return null;
            case KVValueType.Boolean: return value.ToBoolean(CultureInfo.InvariantCulture);
            case KVValueType.String: return value.ToString(CultureInfo.InvariantCulture);
            case KVValueType.BinaryBlob: return new JsonObject { ["binaryBlob"] = value.AsBlob().Length };
            case KVValueType.FloatingPoint:
            case KVValueType.FloatingPoint64:
                return value.ToDouble(CultureInfo.InvariantCulture);
            case KVValueType.UInt64:
                // Masks can use all 64 bits: as a string, exactly.
                return value.ToUInt64(CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
            default:
                return value.ToInt64(CultureInfo.InvariantCulture);
        }
    }

    static JsonObject SkeletonJson(Skeleton skeleton) => new()
    {
        ["name"] = skeleton.Name,
        ["bones"] = new JsonArray(skeleton.Bones.Select(b => (JsonNode)b.Name).ToArray()),
        ["parents"] = new JsonArray(skeleton.Bones.Select(b => (JsonNode)(b.Parent?.Index ?? -1)).ToArray()),
        ["pos"] = new JsonArray(skeleton.Bones.Select(b => (JsonNode)Vec(b.Position)).ToArray()),
        ["rot"] = new JsonArray(skeleton.Bones.Select(b => (JsonNode)Quat(b.Angle)).ToArray()),
    };

    static JsonArray Vec(Vector3 v) => [Round(v.X), Round(v.Y), Round(v.Z)];
    static JsonArray Quat(Quaternion q) => [Round(q.X), Round(q.Y), Round(q.Z), Round(q.W)];
    static double Round(float x) => Math.Round(x, 6);

    /// <summary>A model: its geometry as GLB (no materials, no animations), and what the viewer needs to name and skin it.</summary>
    static string Model(Resource resource, IFileLoader loader, string outPath)
    {
        var glb = Path.ChangeExtension(outPath, ".glb");
        var exporter = new GltfModelExporter(loader)
        {
            ProgressReporter = new Progress<string>(_ => { }),
            ExportMaterials = false,
            ExportAnimations = false,
            AdaptTextures = false,
            SatelliteImages = false,
        };
        exporter.Export(resource, glb);

        var model = (Model)resource.DataBlock!;
        var info = new JsonObject
        {
            ["name"] = model.Name,
            ["glb"] = glb,
            ["skeleton"] = SkeletonJson(model.Skeleton),
            ["meshGroups"] = new JsonArray(model.GetMeshGroups().Select(g => (JsonNode)g).ToArray()),
            ["defaultMeshGroups"] = new JsonArray(model.GetDefaultMeshGroups().Select(g => (JsonNode)g).ToArray()),
            ["materialGroups"] = new JsonArray(model.GetMaterialGroups().Select(g => (JsonNode)new JsonObject
            {
                ["name"] = g.Name, ["materials"] = new JsonArray(g.Materials.Select(x => (JsonNode)x).ToArray()),
            }).ToArray()),
            ["refMeshGroupMasks"] = Kv(model.Data["m_refMeshGroupMasks"]),
            ["refLODGroupMasks"] = Kv(model.Data["m_refLODGroupMasks"]),
        };
        var meshes = new JsonArray();
        foreach (var (mesh, index, name, lod) in model.GetEmbeddedMeshesAndLoD())
        {
            meshes.Add(MeshInfo(mesh, index, name, lod));
        }
        foreach (var (index, name, lod) in model.GetReferenceMeshNamesAndLoD())
        {
            var meshResource = loader.LoadFileCompiled(name);
            if (meshResource?.DataBlock is Mesh mesh) meshes.Add(MeshInfo(mesh, index, name, lod));
            meshResource?.Dispose();
        }
        info["meshes"] = meshes;
        File.WriteAllText(outPath, info.ToJsonString(Indented));
        return glb;
    }

    static JsonObject MeshInfo(Mesh mesh, int index, string name, long lod)
    {
        var calls = new JsonArray();
        foreach (var sceneObject in mesh.Data.GetArray("m_sceneObjects"))
        {
            foreach (var call in sceneObject.GetArray("m_drawCalls"))
            {
                calls.Add(new JsonObject
                {
                    ["material"] = call.GetStringProperty("m_material"),
                    ["primitives"] = call.GetInt32Property("m_nIndexCount") / 3,
                    ["vertices"] = call.GetInt32Property("m_nVertexCount"),
                });
            }
        }
        return new JsonObject { ["index"] = index, ["name"] = name, ["lodMask"] = lod, ["drawCalls"] = calls };
    }

    /// <summary>An animation clip: every frame's local transforms, in its skeleton's bone order (Source space, inches).</summary>
    static JsonObject Clip(Resource resource, IFileLoader loader)
    {
        var clip = (AnimationClip)resource.DataBlock!;
        var skeleton = Skeleton.FromSkeletonResource(loader, clip.SkeletonName) ?? throw new InvalidDataException("skeleton not found: " + clip.SkeletonName);
        var bones = new FrameBone[skeleton.Bones.Length];
        var tracks = skeleton.Bones.Select(_ => (T: new List<float>(), R: new List<float>())).ToArray();
        for (var f = 0; f < clip.NumFrames; f++)
        {
            clip.ReadFrame(f, bones);
            for (var b = 0; b < bones.Length; b++)
            {
                var p = bones[b].Position;
                var q = bones[b].Angle;
                tracks[b].T.AddRange([p.X, p.Y, p.Z]);
                tracks[b].R.AddRange([q.X, q.Y, q.Z, q.W]);
            }
        }
        var json = SkeletonJson(skeleton);
        json["clip"] = clip.Name;
        json["skeletonName"] = clip.SkeletonName;
        json["duration"] = clip.Duration;
        json["frames"] = clip.NumFrames;
        json["additive"] = clip.IsAdditive;
        json["tracks"] = new JsonArray(tracks.Select(t => (JsonNode)new JsonArray(Compact(t.T, 3), Compact(t.R, 4))).ToArray());
        return json;
    }

    /// <summary>A track's values, or one value when every frame has the same.</summary>
    static JsonArray Compact(List<float> v, int n)
    {
        var constant = true;
        for (var i = n; i < v.Count && constant; i++) constant = Math.Abs(v[i] - v[i % n]) < 1e-6f;
        return new JsonArray((constant ? v.Take(n) : v).Select(x => (JsonNode)Round(x)).ToArray());
    }
}
