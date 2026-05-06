import os
import glob
import re

html_files = glob.glob('*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to replace <body class="dark-theme"> with <body>
    # and update the script to just set the class
    
    pattern = re.compile(r'<body class="dark-theme">\s*<script>\s*\(function\(\)\{\s*var theme = localStorage\.getItem\(''sys_theme''\) \|\| ''dark'';\s*if \(theme === ''light''\) \{\s*document\.body\.classList\.remove\(''dark-theme''\);\s*document\.body\.classList\.add\(''light-theme''\);\s*\}\s*\}\)\(\);\s*</script>', re.MULTILINE)
    
    new_script = '''<body>
    <script>
        (function(){
            var theme = localStorage.getItem('sys_theme') || 'dark';
            document.body.className = theme === 'light' ? 'light-theme' : 'dark-theme';
        })();
    </script>'''
    
    new_content = pattern.sub(new_script, content)
    
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {file}')

