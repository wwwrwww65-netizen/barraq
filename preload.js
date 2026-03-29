const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Database API
    saveOrder: (data) => ipcRenderer.invoke('db-save-order', data),
    getOrders: () => ipcRenderer.invoke('db-get-orders'),
    saveProduct: (product) => ipcRenderer.invoke('db-save-product', product),
    getProducts: () => ipcRenderer.invoke('db-get-products'),
    getInventory: () => ipcRenderer.invoke('db-get-inventory'),
    saveInventoryItem: (item) => ipcRenderer.invoke('db-save-inventory', item),

    // Other utilities
    printReceipt: (html) => ipcRenderer.invoke('print-receipt', html)
});
