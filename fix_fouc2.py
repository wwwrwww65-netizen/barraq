import os
import glob

html_files = glob.glob('*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Let's replace:
    # <body class="dark-theme">
    #     <script>
    #         (function(){
    #             var theme = localStorage.getItem('sys_theme') || 'dark';
    #             if (theme === 'light') {
    #                 document.body.classList.remove('dark-theme');
    #                 document.body.classList.add('light-theme');
    #             }
    #         })();
    #     </script>
    
    # Use simple string replacement to avoid regex issues, stripping exact whitespace might be tricky, so let's use regex without trying to match all spaces perfectly.
    import re
    # Match <body class="dark-theme"> optionally followed by the exact script
    pattern = re.compile(r'<body class="dark-theme">\s*<script>\s*\(function\(\)\{\s*var theme = localStorage\.getItem\(''sys_theme''\) \|\| ''dark'';\s*if \(theme === ''light''\) \{\s*document\.body\.classList\.remove\(''dark-theme''\);\s*document\.body\.classList\.add\(''light-theme''\);\s*\}\s*\}\)\(\);\s*</script>')
    
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

