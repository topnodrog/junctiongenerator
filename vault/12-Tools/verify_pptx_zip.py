#!/usr/bin/env python3
import zipfile
import sys

try:
    with zipfile.ZipFile("JGC_Funding_Pitch.pptx", 'r') as z:
        print("OK - PPTX file is valid ZIP archive")
        print("  Files in archive: " + str(len(z.namelist())))

        # Check for required PPTX structure
        required = ['ppt/presentation.xml', '_rels/.rels', '[Content_Types].xml']
        for req in required:
            if req in z.namelist():
                print("  OK - " + req)
            else:
                print("  MISSING - " + req)
                sys.exit(1)

        # Count slides
        slides = [f for f in z.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
        print("\nOK - " + str(len(slides)) + " slides found")

except Exception as e:
    print("ERROR - " + str(e))
    sys.exit(1)
