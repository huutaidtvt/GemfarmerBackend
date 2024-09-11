const gplay = require('google-play-scraper');
const { BrowserWindow } = require('electron');
const path = require('path');

function downloadAPK(appId) {
    
    const downloadWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    downloadWindow.loadURL(`file://${path.join(__dirname, 'download.html')}`);

    downloadWindow.webContents.executeJavaScript(`
        window.location.href = 'https://d.apkpure.com/b/APK/${appId}?version=latest';
    `);

    setTimeout(() => {
        if (downloadWindow) {
            downloadWindow.close();
        }
    }, 5000); // Thay đổi thời gian nếu cần
}

// Hàm chung để xử lý phân trang
const paginateResults = (res, page, limit) => {
    const totalRecords = res.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startRecord = (page - 1) * limit;
    const endRecord = startRecord + limit;
    const data = res.slice(startRecord, endRecord);

    return {
        data,
        totalRecords,
        totalPages,
        currentPage: page
    };
};

const listApp = (page = 1, limit = 10) => {
    return gplay.list({
        category: gplay.category.APPLICATION,
        collection: gplay.collection.TOP_FREE,
    }).then(res => {
        const paginatedData = paginateResults(res, page, limit);
        console.log(paginatedData);
        return paginatedData;
    });
};


const searchApp = (key, page = 1, limit = 10) => {
    return gplay.search({ 
        term: key 
    })
    .then(res => {
        const paginatedData = paginateResults(res, page, limit);
        console.log(paginatedData);
        return paginatedData;
    });
};

module.exports = {
    listApp,
    searchApp,
    downloadAPK
}
