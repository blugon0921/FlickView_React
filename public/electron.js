const { app, Menu, screen, BrowserWindow, ipcMain, dialog, ipcRenderer } = require("electron")
let isDev = require("electron-is-dev")
const path = require("path")
const url = require('url')
const { ffmpeg, AppData, asyncFfprobe } = require("./electronModule")
const fs = require("fs")


/*
2.0.1

전체화면에서 사이드바 토글이 되던 버그 수정
동영상이 로딩중일때 재생바를 클릭할 수 있던 버그 수정
사이드바 밑에 빈공간이 생기던 버그 수정
클립 생성창 토글 방식을 메뉴에서 Ctrl+C 단축키로 변경
창 최소 크기 960x540으로 변경
*/

if(!fs.existsSync(AppData)) fs.mkdirSync(AppData)
const isFirst = app.requestSingleInstanceLock()
if(!isFirst) {
    app.quit()
    return
} else app.on("second-instance", (workingDirectory, argv, additionalData) => {
    createWindow(argv, 2)
})

const windows = []
isDev? true : Menu.setApplicationMenu(false) //Off Menu
function createWindow(argv, openIndex) {
    const primaryDisplay = screen.getAllDisplays()[0]
    const { width, height } = primaryDisplay.size

    const win = new BrowserWindow({
        width: Math.ceil(width*(1547/1920)), //1920기준 1547
        height: Math.ceil(height*(900/1080)), //1080기준 900
        minWidth: Math.ceil(width*(960/1920)), //1920기준 960
        minHeight: Math.ceil(height*(540/1080)), //1080기준 540
        maxWidth: width, //1920기준 1920
        maxHeight: height, //1080기준 1080
        center: true,
        show: true,
        icon: `${__dirname}/icon.png`,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            // devTools: isDev,
            enableRemoteModule: true
        }
    })
    require("@electron/remote/main").enable(win.webContents)

    isDev ? win.loadURL("http://localhost:3000")
          : win.loadFile(`${__dirname}/../build/index.html`)

    win.webContents.once("did-finish-load", async () => {
        win.show()
        isDev? win.webContents.openDevTools() : false
        win.webContents.send("setId", [windows.length])
        windows.push(win)
        // win.webContents.openDevTools()
        if(process.platform == "win32" && 2 <= argv.length) {
            if(argv[openIndex] && argv[openIndex] !== ".") {
                if(!fs.existsSync(argv[openIndex])) return
                if(!videoExtensions.includes(path.extname(argv[openIndex]).replace(".", "").toLowerCase())) return
                win.webContents.send(OPEN_VIDEO, [argv[openIndex], isDev])
            }
        }
    })
    return win
}

app.whenReady().then(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
        require("@electron/remote/main").initialize()
        require("./update")(app, createWindow(process.argv, 1))
    }
})

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
})


const {
    OPEN_FILE,
    OPEN_VIDEO,
    VIDEO_INFO,
    VIDEO_INFO_RESPONSE,
    VIDEOS_IN_PATH,
    VIDEOS_IN_PATH_RESPONSE,
    FULL_SCREEN
} = require("./constants")

ipcMain.on(OPEN_FILE, (event) => {
    dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
            { name: "동영상 파일", extensions: videoExtensions},
        ]
    }).then(async result => {
        if (!result.canceled) {
            const filePath = result.filePaths[0]
            // event.sender.send("selectComplete", [filePath, await getFps(filePath)])
            event.sender.send(OPEN_VIDEO, [filePath])
        }
    }).catch(err => {
        console.log(err)
    })
})

const saveScreenshot = require("./saveScreenshot");
saveScreenshot.initialized(ffmpeg)
const saveClip = require("./saveClip");
saveClip.initialized(ffmpeg)


ipcMain.on(VIDEO_INFO, async (event, args) => {
    const videoPath = args[0]
    const info = await asyncFfprobe(videoPath)
    info.duration = info.duration.inSeconds()
    event.sender.send(`${VIDEO_INFO_RESPONSE}${args[1]}`, [info, args[1]])
})

ipcMain.on(VIDEOS_IN_PATH, async(event, args) => {
    const videoPath = args[0]
    const folder = videoPath.substring(0,videoPath.lastIndexOf("\\")+1)
    const videos = fs.readdirSync(folder).filter(file => videoExtensions.includes(path.extname(file).replace(".", "").toLowerCase()))
    const videoList = []
    videos.forEach(video => {
        videoList.unshift(`${folder}${video}`)
    })
    const reverse = [];
    for(let i=videoList.length-1; i >= 0; i--) {
        reverse.push(videoList[i]);
    }
    event.sender.send(VIDEOS_IN_PATH_RESPONSE, reverse)
})

ipcMain.on(FULL_SCREEN, (event, args) => {
    const window = windows[args[0]]
    window.setFullScreen(args[1])
})

ipcMain.on("end", (event, args) => {
    const window = windows[args[0]]
    window.destroy()
})

const videoExtensions = [
    "webm",
    "ogv",
    "mov",
    "mp4",
    "m4v",
    "mkv",
]