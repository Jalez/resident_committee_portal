import os

base_dir = "app/routes"
output_file = "app/routes.ts"

routes = []

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if not file.endswith(".tsx"):
            continue
            
        full_path = os.path.join(root, file)
        # relative path from app/ folder for the import string
        # e.g. "routes/events/_index.tsx"
        rel_path = os.path.relpath(full_path, "app")
        
        # Calculate URL path
        # Remove "app/routes/" prefix from matching logic
        path_rel = os.path.relpath(full_path, base_dir)
        
        # Split into segments
        if "/" in path_rel:
            segments = path_rel.split("/")
        else:
            segments = [path_rel]
            
        # Remove filename from segments if it's _index.tsx or route.tsx
        filename = segments[-1]
        if filename == "_index.tsx" or filename == "index.tsx" or filename == "route.tsx":
            segments = segments[:-1]
        else:
            # If it's some other file, maybe ignore? 
            # But earlier we had flat files like "events.tsx".
            # If we still have them?
            if filename.endswith(".tsx"):
                segments[-1] = filename[:-4] # remove .tsx
        
        # Process segments for URL
        url_segments = []
        for seg in segments:
            if seg.startswith("$"):
                url_segments.append(":" + seg[1:])
            else:
                url_segments.append(seg)
                
        url_path = "/".join(url_segments)
        
        if url_path == "":
            routes.append(f'    index("{rel_path}"),')
        else:
            routes.append(f'    route("{url_path}", "{rel_path}"),')

# Sort routes for consistent output
routes.sort()

content = """import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
""" + "\n".join(routes) + """
] satisfies RouteConfig;
"""

with open(output_file, "w") as f:
    f.write(content)

print(f"Generated {output_file} with {len(routes)} routes.")
