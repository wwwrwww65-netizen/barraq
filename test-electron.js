const { app } = require("electron"); console.log("app:", typeof app); app ? app.quit() : process.exit(1);
