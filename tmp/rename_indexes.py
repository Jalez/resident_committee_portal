import os
import shutil
import re

base_dir = "/Users/jaakkorajala/Projects/hippos_kotisivut/hippos-portal/app/routes"

def find_files(dir_path):
    matches = []
    for root, dirs, files in os.walk(dir_path):
        for file in files:
            if file == "_index.tsx":
                matches.append(os.path.join(root, file))
    return matches

files = find_files(base_dir)

print(f"Found {len(files)} _index.tsx files.")

for src in files:
    dst = os.path.join(os.path.dirname(src), "index.tsx")
    
    # Rename
    print(f"Renaming {src} -> {dst}")
    shutil.move(src, dst)
    
    # Update content
    with open(dst, 'r') as f:
        content = f.read()
    
    # Update +types import
    # from "./+types/_index" -> from "./+types/index"
    new_content = content.replace('from "./+types/_index"', 'from "./+types/index"')
    
    if content != new_content:
        with open(dst, 'w') as f:
            f.write(new_content)
        print("Updated imports.")
    else:
        # Sometimes it might be generic "+types/route" if I did that previously
        pass

