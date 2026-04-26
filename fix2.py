import sys
with open('e:/baraaq/main.js', 'r', encoding='utf-8') as f:
    main_js = f.read()

with open('e:/baraaq/deliver.js', 'r', encoding='utf-8') as f:
    deliver_js = f.read()

start_tag = 'async function deliverWhatsAppMessage(data) {'
end_tag = 'async function teardownWaClient() {'

start_idx = main_js.find(start_tag)
end_idx = main_js.find(end_tag)

if start_idx != -1 and end_idx != -1:
    new_main = main_js[:start_idx] + deliver_js + '\n' + main_js[end_idx:]
    with open('e:/baraaq/main.js', 'w', encoding='utf-8') as f:
        f.write(new_main)
    print("Fixed!")
else:
    print("Tags not found!")
