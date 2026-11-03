// shader-dump: writes a compiled CS2 shader's parameter table and the GLSL of its static combos, for the pipeline's
// converter (convert-shaders.mjs). Reads only the copies under the source root, writes only under the output root.
//
//   shader-dump --vpk <shaders_vulkan_dir.vpk> --shader <name> --out <dir> [--only S_NAME=v,S_NAME=v;...]
//
// Output (in <dir>/<shader>/):
//   table.json            static combos, features, and every ps / vs variable (type, defaults, sRGB, expression)
//   ps_<id>.glsl, vs_<id>.glsl   SPIR-V reflected to GLSL for static combo <id> (dynamic combo 0)
//   combos.json           { "<id>": { "S_NAME": value, ... } } for every combo written

using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using SteamDatabase.ValvePak;
using ValveResourceFormat.CompiledShader;
using ValveResourceFormat.Utils;
using Vortice.SpirvCross;

static class Program
{
    static readonly string SourceRoot = Path.GetFullPath(Environment.GetEnvironmentVariable("CS2_SOURCE") ?? @"C:\cs2-data\source");
    static readonly string OutputRoot = Path.GetFullPath(Environment.GetEnvironmentVariable("CS2_EXTRACTED") ?? @"C:\cs2-data\extracted");

    static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0] == "list")
            {
                // Every file in the VPK, one game path per line.
                var l = ParseArgs(args[1..], ["vpk", "out"]);
                using var package = new Package();
                package.Read(Inside(SourceRoot, l["vpk"], "--vpk"));
                var lines = package.Entries!.Values.SelectMany(x => x).Select(e => e.GetFullPath()).OrderBy(x => x, StringComparer.Ordinal);
                Write(Inside(OutputRoot, l["out"], "--out"), string.Join("\n", lines) + "\n");
                return 0;
            }
            if (args.Length > 0 && args[0] == "extract")
            {
                var e = ParseArgs(args[1..], ["vpk", "jobs", "report"]);
                Extract.Run(Inside(SourceRoot, e["vpk"], "--vpk"), e["jobs"], e["report"], p => Inside(OutputRoot, p, "output"));
                return 0;
            }
            var opts = ParseArgs(args, ["vpk", "shader", "out"]);
            var vpk = Inside(SourceRoot, opts["vpk"], "--vpk");
            var shader = opts["shader"];
            var outDir = Inside(OutputRoot, Path.Combine(opts["out"], shader), "--out");
            var only = opts.TryGetValue("only", out var o) ? ParseOnly(o) : null;
            Directory.CreateDirectory(outDir);
            Dump(vpk, shader, outDir, only);
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("shader-dump: " + e.Message);
            return 1;
        }
    }

    static Dictionary<string, string> ParseArgs(string[] args, string[] required)
    {
        var d = new Dictionary<string, string>();
        for (var i = 0; i + 1 < args.Length; i += 2)
        {
            if (!args[i].StartsWith("--", StringComparison.Ordinal)) throw new ArgumentException("unexpected " + args[i]);
            d[args[i][2..]] = args[i + 1];
        }
        foreach (var k in required)
            if (!d.ContainsKey(k)) throw new ArgumentException($"--{k} is required");
        return d;
    }

    /// <summary>The full path, refusing anything outside the allowed root.</summary>
    static string Inside(string root, string path, string what)
    {
        var full = Path.GetFullPath(path);
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"{what} must be under {root}: {full}");
        return full;
    }

    /// <summary>"S_A=1,S_B=0;S_A=2" → a list of partial static configurations; a combo is written when it matches one.</summary>
    static List<Dictionary<string, int>> ParseOnly(string s) =>
        s.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(set => set.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(kv => kv.Split('='))
                .ToDictionary(kv => kv[0].Trim(), kv => int.Parse(kv[1].Trim(), System.Globalization.CultureInfo.InvariantCulture)))
            .ToList();

    static void Dump(string vpkPath, string shader, string outDir, List<Dictionary<string, int>>? only)
    {
        using var package = new Package();
        package.Read(vpkPath);
        // The lookup keeps the name up to its last '_' and loads every vcs starting with it: "<shader>_vulkan_50"
        // (a bare "<shader>" would also pick up "<shader>_preview").
        using var collection = ShaderCollection.GetShaderCollection(shader + "_vulkan_50_ps.vcs", package);
        var features = collection.Get(VcsProgramType.Features) ?? throw new InvalidOperationException("no features program for " + shader);
        var ps = collection.Get(VcsProgramType.PixelShader) ?? throw new InvalidOperationException("no pixel shader for " + shader);
        var vs = collection.Get(VcsProgramType.VertexShader);

        var featureNames = features.StaticComboArray.Select(c => c.Name).ToList();
        var names = new Dictionary<uint, string>(StringToken.InvertedTable);
        foreach (var p in new[] { features, ps, vs })
            foreach (var v in p?.VariableDescriptions ?? [])
                names[StringToken.Get(v.Name)] = v.Name;

        var table = new JsonObject
        {
            ["shader"] = shader,
            ["features"] = new JsonArray(features.StaticComboArray.Select(c => (JsonNode)new JsonObject
            {
                ["name"] = c.Name, ["min"] = c.RangeMin, ["max"] = c.RangeMax,
            }).ToArray()),
            ["static"] = new JsonArray(ps.StaticComboArray.Select(c => (JsonNode)new JsonObject
            {
                ["name"] = c.Name, ["min"] = c.RangeMin, ["max"] = c.RangeMax,
                ["feature"] = c.FeatureIndex >= 0 ? featureNames[c.FeatureIndex] : null,
            }).ToArray()),
            ["ps"] = Variables(ps, names, featureNames),
            ["vs"] = vs is null ? new JsonObject() : Variables(vs, names, featureNames),
        };
        Write(Path.Combine(outDir, "table.json"), table.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

        var combos = new JsonObject();
        var psConfig = new ConfigMappingParams(ps);
        foreach (var (id, entry) in ps.StaticComboEntries)
        {
            var state = psConfig.GetConfigState(id);
            var config = ps.StaticComboArray.Select((c, i) => (c.Name, Value: state[i])).ToDictionary(x => x.Name, x => x.Value);
            if (only != null && !only.Any(want => want.All(kv => config.TryGetValue(kv.Key, out var v) && v == kv.Value))) continue;

            var combo = entry.Unserialize();
            var written = WriteGlsl(combo, Path.Combine(outDir, $"ps_{id}.glsl"));
            combo.Dispose();
            if (!written) continue;
            combos[id.ToString(System.Globalization.CultureInfo.InvariantCulture)] = new JsonObject(config.Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)kv.Value)));
        }
        if (vs != null)
        {
            // The vertex shader's combos are few: all of them.
            foreach (var (id, entry) in vs.StaticComboEntries)
            {
                var combo = entry.Unserialize();
                WriteGlsl(combo, Path.Combine(outDir, $"vs_{id}.glsl"));
                combo.Dispose();
            }
            var vsConfig = new ConfigMappingParams(vs);
            table["vsCombos"] = new JsonObject(vs.StaticComboEntries.Keys.Select(id =>
            {
                var st = vsConfig.GetConfigState(id);
                return KeyValuePair.Create(id.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    (JsonNode?)new JsonObject(vs.StaticComboArray.Select((c, i) => KeyValuePair.Create(c.Name, (JsonNode?)st[i]))));
            }));
            Write(Path.Combine(outDir, "table.json"), table.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        Write(Path.Combine(outDir, "combos.json"), combos.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"{shader}: {combos.Count} pixel shader combos, {ps.VariableDescriptions.Length} variables -> {outDir}");
    }

    static bool WriteGlsl(VfxStaticComboData combo, string path)
    {
        if (combo.ShaderFiles.Length == 0 || combo.ShaderFiles[0] is not VfxShaderFileVulkan spirv || spirv.IsEmpty()) return false;
        if (!ShaderSpirvReflection.ReflectSpirv(spirv, Backend.GLSL, out var code))
            throw new InvalidOperationException("SPIR-V reflection failed for " + path + ": " + code);
        Write(path, code.Replace("\r\n", "\n"));
        return true;
    }

    static JsonObject Variables(VfxProgramData program, Dictionary<uint, string> names, List<string> features)
    {
        var o = new JsonObject();
        foreach (var v in program.VariableDescriptions)
        {
            var type = ShaderUtilHelpers.GetVfxVariableTypeString(v.VfxType);
            var n = Math.Clamp(v.RegisterElements, 1, 4);
            var isInt = type.StartsWith("int", StringComparison.Ordinal) || type.StartsWith("bool", StringComparison.Ordinal);
            var entry = new JsonObject
            {
                ["type"] = type,
                ["source"] = v.VariableSource.ToString(),
                ["elements"] = v.RegisterElements,
                ["default"] = new JsonArray((isInt ? v.IntDefs.Take(n).Select(x => (JsonNode)x) : v.FloatDefs.Take(n).Select(x => (JsonNode)x)).ToArray()),
            };
            if (type.StartsWith("Sampler", StringComparison.OrdinalIgnoreCase) || type.StartsWith("Texture", StringComparison.OrdinalIgnoreCase))
            {
                entry["srgb"] = v.SrgbRead;
                if (!string.IsNullOrEmpty(v.DefaultInputTexture)) entry["defaultTexture"] = v.DefaultInputTexture;
            }
            if (v.HasDynamicExpression)
            {
                try { entry["expr"] = Decode(v.DynExp, names, features); }
                catch (Exception e) { entry["exprError"] = e.Message; }
            }
            o[v.Name] = entry;
        }
        return o;
    }

    /// <summary>
    /// A VFX dynamic expression as [byte offset, op, ...args] instructions, the stack machine the viewer runs
    /// (viewer/src/lib/materials/composite-expr.ts). Branch and jump targets are byte offsets.
    /// </summary>
    static JsonArray Decode(byte[] code, Dictionary<uint, string> names, List<string> features)
    {
        var list = new JsonArray();
        using var r = new BinaryReader(new MemoryStream(code));
        string Name(uint token) => names.TryGetValue(token, out var s) ? s : $"#{token:x8}";
        while (r.BaseStream.Position < r.BaseStream.Length)
        {
            var at = (int)r.BaseStream.Position;
            var op = r.ReadByte();
            JsonNode[] ins = op switch
            {
                0x00 => ["END"],
                0x01 => ["NOP"],
                0x02 => ["JUMP", r.ReadUInt16()],
                0x04 => ["BRANCH", r.ReadUInt16(), r.ReadUInt16()],
                0x06 => Func(r),
                0x07 => ["PUSH", r.ReadSingle()],
                0x08 => ["ASSIGN", r.ReadByte()],
                0x09 => ["LOAD", r.ReadByte()],
                0x0C => ["NOT"],
                0x0D => ["BIN", "=="], 0x0E => ["BIN", "!="], 0x0F => ["BIN", ">"], 0x10 => ["BIN", ">="],
                0x11 => ["BIN", "<"], 0x12 => ["BIN", "<="], 0x13 => ["BIN", "+"], 0x14 => ["BIN", "-"],
                0x15 => ["BIN", "*"], 0x16 => ["BIN", "/"], 0x17 => ["BIN", "%"],
                0x18 => ["NEG"],
                0x19 => ["EXT", Name(r.ReadUInt32())],
                0x1A => ["FEATURE", r.ReadByte()],
                0x1D => ["PARAM", Name(r.ReadUInt32())],
                0x1E => ["SWIZZLE", r.ReadByte()],
                0x1F => ["EXISTS", Name(r.ReadUInt32())],
                0x22 => ["SYSTEM", r.ReadByte()],
                _ => throw new InvalidDataException($"unsupported opcode 0x{op:x2} at {at}"),
            };
            var row = new JsonArray { at };
            foreach (var x in ins) row.Add(x);
            list.Add(row);
            if (op == 0x00) break;
        }
        return list;
    }

    static readonly string[] Functions =
    [
        "sin", "cos", "tan", "frac", "floor", "ceil", "saturate", "clamp", "lerp", "dot4", "dot3", "dot2", "log", "log2", "log10",
        "exp", "exp2", "sqrt", "rsqrt", "sign", "abs", "pow", "step", "smoothstep", "float4", "float3", "float2", "time", "min", "max",
        "SrgbLinearToGamma", "SrgbGammaToLinear", "random", "normalize", "length", "sqr", "rotation2d", "rotate2d", "sincos",
        "TextureSize", "TextureAverageColor", "MatrixIdentity", "MatrixScale", "MatrixTranslate", "MatrixAxisAngle", "MatrixAxisToAxis",
        "MatrixMultiply", "MatrixColorCorrect", "MatrixColorCorrect2", "MatrixColorTint", "normalize_safe", "Remap01ScaleOffset",
        "radians", "degrees", "MatrixColorTint2", "MatrixColorTint3", "RemapVal", "RemapValClamped",
    ];

    static JsonNode[] Func(BinaryReader r)
    {
        var id = r.ReadByte();
        r.ReadByte();
        if (id >= Functions.Length) throw new InvalidDataException($"unknown function id 0x{id:x2}");
        return ["FUNC", Functions[id]];
    }

    static void Write(string path, string text)
    {
        Inside(OutputRoot, path, "output");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, text, new UTF8Encoding(false));
    }
}
