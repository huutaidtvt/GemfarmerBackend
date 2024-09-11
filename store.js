const gplay = require('google-play-scraper');
const apkpureCrawler = require('apkpure-crawler');
const path = require('path');
const os = require('os');

async function downloadAPK(appId, version) {
    const downloadDir = path.join(os.homedir(), 'Downloads');
    const data = await apkpureCrawler.downloadApk(appId, version, downloadDir);

    if(data) {
        console.log('Downloaded APK successfully');
    }else{
        console.log('Failed to download APK');
    }

    apkpureCrawler.closeBrowser();
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
