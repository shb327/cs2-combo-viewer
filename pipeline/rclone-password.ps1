# Prints rclone's config password for rclone's --password-command, from a file only this Windows user can decrypt
# (DPAPI). upload.mjs passes it to rclone when the file exists; rclone reads the output, nothing else does.
# Make the file once (see pipeline/README.md, "Upload"):
#   Read-Host -AsSecureString 'rclone config password' | ConvertFrom-SecureString | Set-Content -Encoding ascii C:\dev\tools\rclone-pass.dpapi
param([string]$File = 'C:\dev\tools\rclone-pass.dpapi')
$secure = Get-Content -LiteralPath $File | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
