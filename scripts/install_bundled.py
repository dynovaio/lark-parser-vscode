#!/usr/bin/env python3
"""
Bundle script to create a self-contained Python environment for the language server.
Based on the approach used by black-formatter extension.
"""

import os
import sys
import subprocess
import shutil
import tempfile
from pathlib import Path


def main():
    """Create bundled Python environment."""
    print("🚀 Creating bundled Python environment for Lark Language Server...")

    # Paths
    repo_root = Path(__file__).parent.parent  # Go up one level from scripts/
    bundled_dir = repo_root / "bundled"
    libs_dir = bundled_dir / "libs"

    # Clean existing bundle
    if bundled_dir.exists():
        print("🧹 Cleaning existing bundle...")
        shutil.rmtree(bundled_dir)

    # Create bundle directory structure
    bundled_dir.mkdir()
    libs_dir.mkdir()

    # Install dependencies to libs directory
    print("📚 Installing Python dependencies...")
    requirements = [
        "lark_parser_language_server==0.1.0"
    ]

    # Use pip to install to target directory
    for req in requirements:
        print(f"  Installing {req}...")
        subprocess.run([
            sys.executable, "-m", "pip", "install",
            "--target", str(libs_dir),
            "--no-deps",  # Install only the package, not its dependencies
            req
        ], check=True)

    # Install dependencies of dependencies
    print("🔗 Installing dependency chains...")
    all_deps = [
        "lark_parser_language_server==0.1.0"
    ]

    subprocess.run([
        sys.executable, "-m", "pip", "install",
        "--target", str(libs_dir),
        "--upgrade",
        *all_deps
    ], check=True)

    # Create __main__.py entry point
    print("🎯 Creating entry point...")
    main_py_content = '''#!/usr/bin/env python3
"""
Bundled entry point for Lark Language Server.
This script ensures the bundled dependencies are used.
"""

import sys
import os
from pathlib import Path

# Add bundled libs to Python path
bundled_dir = Path(__file__).parent
libs_dir = bundled_dir / "libs"
sys.path.insert(0, str(libs_dir))
sys.path.insert(0, str(bundled_dir))

# Now import and run the language server
try:
    from lark_language_server.__main__ import main
    main()
except ImportError as e:
    print(f"Error: Could not import language server: {e}", file=sys.stderr)
    print(f"Python path: {sys.path}", file=sys.stderr)
    sys.exit(1)
'''

    with open(bundled_dir / "__main__.py", "w") as f:
        f.write(main_py_content)

    # Make it executable
    os.chmod(bundled_dir / "__main__.py", 0o755)

    # Create a simple test script
    test_script = bundled_dir / "test_bundle.py"
    with open(test_script, "w") as f:
        f.write('''#!/usr/bin/env python3
"""Test script to verify the bundle works."""
import sys
from pathlib import Path

# Add bundled libs to path
bundled_dir = Path(__file__).parent
libs_dir = bundled_dir / "libs"
sys.path.insert(0, str(libs_dir))
sys.path.insert(0, str(bundled_dir))

try:
    import lark
    import pygls.server
    import lsprotocol.types
    from lark_language_server.server import LarkLanguageServer
    print("✅ Bundle test successful - all imports work!")
    print(f"Lark version: {lark.__version__}")
    print(f"Bundle directory: {bundled_dir}")
except ImportError as e:
    print(f"❌ Bundle test failed: {e}")
    sys.exit(1)
''')

    os.chmod(test_script, 0o755)

    print("🎉 Bundle creation complete!")
    print(f"📁 Bundle directory: {bundled_dir}")
    print(f"🧪 Test with: python3 {test_script}")
    print(f"🚀 Run server with: python3 {bundled_dir / '__main__.py'}")

    # Test the bundle
    print("\n🧪 Testing bundle...")
    try:
        subprocess.run([sys.executable, str(test_script)], check=True)
        print("✅ Bundle test passed!")
    except subprocess.CalledProcessError:
        print("❌ Bundle test failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
