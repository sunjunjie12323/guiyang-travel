#Requires -Version 5.1
<#
.SYNOPSIS
    Install Workbench CLI on Windows.
.DESCRIPTION
    Downloads and installs workbench.exe.
    - Normal user: installs to %LOCALAPPDATA%\Programs\workbench\ and adds to user PATH (no admin required).
    - SYSTEM account: installs to %ProgramFiles%\workbench\ with a shim in System32 for immediate availability.
.EXAMPLE
    irm https://workbench-cli.oss-cn-hangzhou.aliyuncs.com/install.ps1 | iex
.EXAMPLE
    $env:VERSION="v0.1.4-beta"; irm https://workbench-cli.oss-cn-hangzhou.aliyuncs.com/install.ps1 | iex
#>

& {
    $ErrorActionPreference = "Stop"

    $BaseUrl = "https://workbench-cli.oss-cn-hangzhou.aliyuncs.com"
    $Version = $env:VERSION

    # --- Detect SYSTEM account and choose install strategy ---
    $IsSystem = ([System.Security.Principal.WindowsIdentity]::GetCurrent().IsSystem)
    $InstallDir = Join-Path $env:ProgramFiles "workbench"

    # --- Normalize and validate version format ---
    if ($Version) {
        # Auto-add 'v' prefix if missing
        if ($Version -notmatch '^v') {
            $Version = "v$Version"
        }
        # Validate: vMAJOR.MINOR.PATCH[-prerelease]
        if ($Version -notmatch '^v\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$') {
            Write-Host "Error: invalid version format '$Version'" -ForegroundColor Red
            Write-Host "Expected: vMAJOR.MINOR.PATCH[-prerelease] (e.g. v1.0.0, v0.1.7-beta)"
            return
        }
    }

    # --- Resolve download URL ---
    if ($Version) {
        $UrlPrefix = "$BaseUrl/releases/$Version"
    } else {
        $UrlPrefix = "$BaseUrl/latest"
    }

    $Archive = "workbench-windows-amd64.zip"
    $ArchiveUrl = "$UrlPrefix/$Archive"
    $ChecksumUrl = "$UrlPrefix/checksums.sha256"

    Write-Host "Installing workbench (windows/amd64)"
    if ($Version) {
        Write-Host "  version: $Version"
    } else {
        Write-Host "  version: latest"
    }
    Write-Host "  to:      $InstallDir\workbench.exe"
    Write-Host ""

    # --- Create temp directory ---
    $TmpDir = Join-Path $env:TEMP ("workbench-install-" + (New-Guid).Guid)
    New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

    try {
        # --- Download archive ---
        Write-Host "Downloading $Archive..."
        $ArchivePath = Join-Path $TmpDir $Archive
        try {
            Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath -UseBasicParsing
        } catch {
            Write-Host ""
            Write-Host "Error: failed to download $ArchiveUrl" -ForegroundColor Red
            if ($Version) {
                Write-Host "Check that version '$Version' exists."
            }
            return
        }

        # --- Verify checksum ---
        Write-Host "Verifying checksum..."
        $ChecksumPath = Join-Path $TmpDir "checksums.sha256"
        $ChecksumOk = $false
        try {
            Invoke-WebRequest -Uri $ChecksumUrl -OutFile $ChecksumPath -UseBasicParsing
            $Lines = Get-Content $ChecksumPath
            foreach ($Line in $Lines) {
                if ($Line -match "^(\S+)\s+.*$Archive") {
                    $Expected = $Matches[1]
                    $Actual = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
                    if ($Actual -ne $Expected) {
                        Write-Host "Error: checksum mismatch!" -ForegroundColor Red
                        Write-Host "  expected: $Expected"
                        Write-Host "  actual:   $Actual"
                        return
                    }
                    Write-Host "  checksum OK"
                    $ChecksumOk = $true
                    break
                }
            }
            if (-not $ChecksumOk) {
                Write-Host "  Warning: archive not found in checksums file, skipping verification" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  Warning: could not download checksums, skipping verification" -ForegroundColor Yellow
        }

        # --- Extract ---
        Write-Host "Extracting..."
        $ExtractDir = Join-Path $TmpDir "extract"
        Expand-Archive -Path $ArchivePath -DestinationPath $ExtractDir -Force

        # Find the binary
        $Binary = Get-ChildItem -Path $ExtractDir -Recurse -Filter "workbench.exe" | Select-Object -First 1
        if (-not $Binary) {
            Write-Host "Error: could not find workbench.exe in archive" -ForegroundColor Red
            return
        }

        # --- Install ---
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }

        $TargetPath = Join-Path $InstallDir "workbench.exe"

        # Handle running binary: rename old, place new
        if (Test-Path $TargetPath) {
            $OldPath = "$TargetPath.old"
            if (Test-Path $OldPath) { Remove-Item $OldPath -Force }
            try {
                Rename-Item -Path $TargetPath -NewName "workbench.exe.old" -Force
            } catch {
                # Not running, just remove it
                Remove-Item $TargetPath -Force
            }
        }

        Copy-Item -Path $Binary.FullName -Destination $TargetPath -Force

        # Clean up old binary
        $OldPath = "$TargetPath.old"
        if (Test-Path $OldPath) {
            Remove-Item $OldPath -Force -ErrorAction SilentlyContinue
        }

        # --- Make command available ---
        if ($IsSystem) {
            # SYSTEM account: place a shim in System32 (always in PATH) for immediate availability.
            $CmdShim = Join-Path $env:SystemRoot "System32\workbench.cmd"
            Set-Content -Path $CmdShim -Value "@`"$TargetPath`" %*" -Force
        } else {
            # Normal user: add to user-level PATH (effective after re-login).
            $RegKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
            $UserPath = $RegKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            if (-not $UserPath) { $UserPath = "" }
            # Force array to avoid string concatenation when only one entry exists
            [string[]]$PathEntries = @($UserPath -split ";" | Where-Object { $_ -ne "" })
            if ($InstallDir -notin $PathEntries) {
                $NewPath = ($PathEntries + $InstallDir) -join ";"
                # Preserve REG_EXPAND_SZ type to maintain %VAR% references
                $RegKey.SetValue('Path', $NewPath, [Microsoft.Win32.RegistryValueKind]::ExpandString)
                Write-Host "  Added $InstallDir to user PATH"
            }
            $RegKey.Close()
        }

        # Update current session PATH
        if ($env:PATH -notlike "*$InstallDir*") {
            $env:PATH = "$InstallDir;$env:PATH"
        }

        # --- Verify ---
        Write-Host ""
        & $TargetPath version
        Write-Host ""
        Write-Host "Done. Run 'workbench' to get started." -ForegroundColor Green
        if (-not $IsSystem) {
            Write-Host ""
            Write-Host "Note: log off and re-login for PATH to take effect in new terminals." -ForegroundColor Cyan
        }

    } finally {
        # Cleanup temp directory
        Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

