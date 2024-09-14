const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Hàm để sao chép các tệp và thư mục từ thư mục nguồn sang zip
function createBackup(sourceDir, outputZip) {
    const zip = new AdmZip();

    // Hàm đệ quy để thêm file và thư mục vào zip
    function addFilesToZip(dir, baseDir) {
        const files = fs.readdirSync(dir);

        files.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Nếu là thư mục, tiếp tục thêm các tệp trong thư mục này
                const newBaseDir = path.join(baseDir, file);
                addFilesToZip(fullPath, newBaseDir);
            } else {
                // Nếu là file, thêm file vào zip
                const zipPath = path.join(baseDir, file);
                zip.addLocalFile(fullPath, path.dirname(zipPath));
            }
        });
    }

    // Lặp qua từng thư mục con trong thư mục profile
    const subDirs = fs.readdirSync(sourceDir).filter(subDir => {
        const fullPath = path.join(sourceDir, subDir);
        return fs.statSync(fullPath).isDirectory();
    });

    subDirs.forEach(subDir => {
        const subDirPath = path.join(sourceDir, subDir);

        // Thêm file Data.mins và key.txt (nếu tồn tại)
        const dataMinsPath = path.join(subDirPath, 'Data.mins');
        const keyTxtPath = path.join(subDirPath, 'key.txt');

        if (fs.existsSync(dataMinsPath)) {
            zip.addLocalFile(dataMinsPath, subDir);
        }
        if (fs.existsSync(keyTxtPath)) {
            zip.addLocalFile(keyTxtPath, subDir);
        }

        // Thêm thư mục Network và Local Storage từ Default (nếu tồn tại)
        const defaultDirPath = path.join(subDirPath, 'Default');
        const networkPath = path.join(defaultDirPath, 'Network');
        const localStoragePath = path.join(defaultDirPath, 'Local Storage');

        if (fs.existsSync(networkPath)) {
            addFilesToZip(networkPath, path.join(subDir, 'Network'));
        }
        if (fs.existsSync(localStoragePath)) {
            addFilesToZip(localStoragePath, path.join(subDir, 'Local Storage'));
        }
    });

    // Lưu zip vào file
    zip.writeZip(outputZip);
    console.log(`Backup has been created at: ${outputZip}`);
}

module.exports = createBackup;
