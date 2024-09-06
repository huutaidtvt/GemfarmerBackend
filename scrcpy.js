
const { exec, execSync, spawn, fork } = require('child_process');
const path = require('path');

let scrcpyProcess = null;

const wsScrcpyPath ="D:\\genlogin\\ws-scrcpy\\ws-scrcpy\\dist\\index.js" ;//path.join(__dirname, 'ws-scrcpy/dist/index.js');
function startScrcpy() {
    if (scrcpyProcess) {
        console.log('ws-scrcpy is already running.');
        return;
    }

    scrcpyProcess =fork(wsScrcpyPath);
    //scrcpyProcess=fork('npm start',{cwd:"D:\\genlogin\\ws-scrcpy\\ws-scrcpy\\dist"})
    scrcpyProcess.on('message', (message) => {
        console.log(`ws-scrcpy message: ${message}`);
    });
    scrcpyProcess.on('error', (error) => {
        console.error(`Error starting ws-scrcpy: ${error}`);
    });
    scrcpyProcess.on('exit', (code) => {
        console.log(`ws-scrcpy exited with code ${code}`);
        scrcpyProcess = null;
    });
    console.log('ws-scrcpy started.');

}
function stopScrcpy() {
    if (!scrcpyProcess) {
        console.log('ws-scrcpy is not running.');
        return;
    }

    // Dừng tiến trình ws-scrcpy
    scrcpyProcess.kill();

    scrcpyProcess.on('exit', (code) => {
        console.log(`ws-scrcpy stopped with exit code ${code}`);
        scrcpyProcess = null;
    });

    console.log('ws-scrcpy stopping.');
}
module.exports = {
    startScrcpy,
    stopScrcpy,

}  