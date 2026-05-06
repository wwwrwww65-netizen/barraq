import os
import glob

html_files = glob.glob('*.html')

old_str = '''<body class="dark-theme">
    <script>
        (function(){
            var theme = localStorage.getItem('sys_theme') || 'dark';
            if (theme === 'light') {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
            }
        })();
    </script>'''

new_str = '''<body>
    <script>
        (function(){
            var theme = localStorage.getItem('sys_theme') || 'dark';
            document.body.className = theme === 'light' ? 'light-theme' : 'dark-theme';
        })();
    </script>'''

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if old_str in content:
        new_content = content.replace(old_str, new_str)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {file}')

