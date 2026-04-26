import re
with open('e:/baraaq/main.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace any newline right before the ending quote in a string concatenation block
c = re.sub(r'\n"\s*\+', r'" +', c)
# Or just replace the bad string formatting entirely
# The bad string has:
#       "new Promise(resolve => {
# " +

c = c.replace('      "new Promise(resolve => {\\n" +\\n', '      "new Promise(resolve => { " +\\n')
c = c.replace('      "  let attempts = 0;\\n" +\\n', '      "  let attempts = 0; " +\\n')

# Actually, the easiest way to fix it is to replace all `" + \n` inside the chatLoaded assignment with backticks
import sys
with open('e:/baraaq/main.js', 'w', encoding='utf-8') as f:
    # Just fix the multiline strings by converting them to template literals if they span lines but are wrapped in "
    # But since it's hard to parse, let's just find the exact text from `const chatLoaded` to the end and replace it correctly.
    
    # Let's restore from the backup or correct the file.
    pass

# A simpler python script to replace line breaks inside double quotes!
def fix_file():
    with open('e:/baraaq/main.js', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for i, line in enumerate(lines):
        if line.endswith('{\n') and line.strip().startswith('"'):
            # This is a broken string line like `      "new Promise(resolve => {`
            lines[i] = line.rstrip('\n') + ' "\n'
        elif line.startswith('" +'):
            lines[i] = line.replace('" +', ' +')

    with open('e:/baraaq/main.js', 'w', encoding='utf-8') as f:
        f.writelines(lines)

fix_file()
