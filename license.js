const crypto = require('crypto');
const si = require('systeminformation');
var md5 = require('md5');
const fetch = require('node-fetch');

module.exports.getIdDevice = async () => {
    let cpu = await getCpucore() + await getSystem();
    return md5(cpu).toUpperCase();
}

function getCpucore() {
    return new Promise((resolve) => {
        si.cpu(cb => {
            resolve(cb.cores + cb.model)
        });
    })
}
function getSystem() {
    return new Promise((resolve) => {
        si.system(cb => {
            resolve(cb.uuid)
        });
    })
}

decryptData = (encryptedData, key) => {
    const parts = atob(encryptedData).split('::', 2);
    if (parts.length !== 2) {
        throw new Error('Invalid data format');
    }
    const encryptedText = parts[0];
    const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    return JSON.parse(decrypted + decipher.final('utf8'));
}
module.exports.checkLicense = async (data) => {
    try{
        const params = {device_code:data.deviceId,app_id:1}
        let response = await fetch("http://103.139.202.40:8080/api/checkLicense",{
            method: 'post',
            body: JSON.stringify(params),
            headers: {
                "Authorization": `Bearer ${data.token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log(response)
        if (response.data.success) {
            let dataDecode = decryptData(response.data.data, data.deviceId);
            response.data.data = dataDecode;
            return response.data;
        }
        else {
            return response.data;
        }
    } catch (error) {
        return { success: false, message: "error " }
    }


}

