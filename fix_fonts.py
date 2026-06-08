import glob
import re

html_files = glob.glob('*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if 'node_modules/@fontsource/cairo/index.css' in content and 'cairo-arabic-400-normal.woff2' not in content:
        # Some files might not have <!-- Google Fonts --> comment exactly, so just replace the fontsource line
        new_content = re.sub(
            r'(<link rel="stylesheet" href="node_modules/@fontsource/cairo/index.css">)',
            r'<!-- Preload Fonts to prevent FOUC -->\n    <link rel="preload" href="node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2" as="font" type="font/woff2" crossorigin>\n    <link rel="preload" href="node_modules/@fontsource/cairo/files/cairo-arabic-700-normal.woff2" as="font" type="font/woff2" crossorigin>\n    \1',
            content
        )
        if new_content != content:
            with open(file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Updated {file}')
