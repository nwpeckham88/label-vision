import os

# Determine the base directory of the spec file using PyInstaller's SPECPATH
# spec_root = os.path.abspath(os.path.dirname(__file__)) # <-- This causes NameError
spec_root = SPECPATH # Use PyInstaller's provided variable
# Determine the project root directory (one level up from spec_root)
project_root = os.path.abspath(os.path.join(spec_root, '..'))
# Path to the Next.js static output directory (relative to project_root)
nextjs_out_dir = os.path.join(project_root, 'out')
# Path to the main script
main_script = os.path.join(spec_root, 'app.py') # Define main_script

if not os.path.isdir(nextjs_out_dir):
    raise FileNotFoundError(
        f"Next.js output directory not found at '{nextjs_out_dir}'. "
        "Ensure 'npm run build' has created the 'out/' directory."
    )

# This maps the contents of '../out' to 'web' inside the bundle
bundled_data = [
    (nextjs_out_dir, 'web')
]

block_cipher = None

# This tells PyInstaller where to find your code and its dependencies.
a = Analysis(
    [main_script],
    pathex=[spec_root], # Add the directory containing app.py (now spec_root) to the Python path
    binaries=[],
    datas=bundled_data,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
) 

# --- PYZ Section --- (Standard PyInstaller section)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# --- EXE Section --- (Standard PyInstaller section)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='label_vision_print_service', # Name for the executable
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Change to False to hide console window for GUI app
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
) 