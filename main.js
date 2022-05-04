const { app, Menu, Tray, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const WebSocket = require("ws");
const { io } = require("socket.io-client");
const VtubeStudioAgent = require('./vtubeStudioAgent');

var mainWindow;

const isPrimary = app.requestSingleInstanceLock();
    
if (!isPrimary)
  app.quit()
else
{
  app.on("second-instance", () => {
    if (mainWindow)
    {
      if (mainWindow.isMinimized())
        mainWindow.restore();
      mainWindow.focus();
    }
  })
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    icon: __dirname + "/icon.ico",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    autoHideMenuBar: true,
    useContentSize: true
  })
  
  mainWindow.loadFile("index.html")
  //mainWindow.openDevTools();
  // Minimizing to and restoring from tray
  mainWindow.on("minimize", () => {
    if (data.minimizeToTray)
    {
      setTray();
      mainWindow.setSkipTaskbar(true);
    }
    else
    {
      if (tray != null)
      {
        setTimeout(() => {
          tray.destroy()
        }, 100);
      }

      mainWindow.setSkipTaskbar(false);
    }
  });

  mainWindow.on("restore", () => {
    if (tray != null)
    {
      setTimeout(() => {
        tray.destroy()
      }, 100);
    }

    mainWindow.setSkipTaskbar(false);
  });

  mainWindow.on("close", () => {
    exiting = true;
  });
}

function setTray()
{
  tray = new Tray(__dirname + "/icon.ico");
  contextMenu = Menu.buildFromTemplate([
    { label: "Open", click: () => { mainWindow.restore(); } },
    { label: "Quit", role: "quit" }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => { mainWindow.restore(); });
}

var tray = null, contextMenu;
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
});

var vTubeStudioConnected = true, crowdControlConnected = false;


// Periodically reporting status back to renderer
var exiting = false;
setInterval(() => {
  if (mainWindow != null)
  {
    var status = 0;
    if (portInUse)
      status = 9;
    else if (!crowdControlConnected)
      status = 1;
    else if (!vTubeStudioConnected)
      status = 8;
    else if (socket == null)
      status = 2;
    else if (calibrateStage == 0 || calibrateStage == 1)
      status = 3;
    else if (calibrateStage == 2 || calibrateStage == 3)
      status = 4;
    else if (!connectedBonkerVTube)
      status = 5;
    else if (calibrateStage == -1)
      status = 7;
  
    if (!exiting)
      mainWindow.webContents.send("status", status);
  }
}, 100);

// Loading data from file
// If no data exists, create data from default data file
const defaultData = JSON.parse(fs.readFileSync(__dirname + "/defaultData.json", "utf8"));
if (!fs.existsSync(__dirname + "/data.json"))
  fs.writeFileSync(__dirname + "/data.json", JSON.stringify(defaultData));
var data = JSON.parse(fs.readFileSync(__dirname + "/data.json", "utf8"));

// Get requested data, waiting for any current writes to finish first
async function getData(field)
{
  var data;
  // An error should only be thrown if the other process is in the middle of writing to the file.
  // If so, it should finish shortly and this loop will exit.
  while (data == null)
  {
    try {
      data = JSON.parse(fs.readFileSync(__dirname + "/data.json", "utf8"));
    } catch {}
  }
  data = JSON.parse(fs.readFileSync(__dirname + "/data.json", "utf8"));
  return data[field];
}

// ----------------
// Websocket Server
// ----------------

var wss, portInUse = false, socket, cc_socket, vtube_socket, connectedBonkerVTube = false;

createServer();

function createServer()
{
  portInUse = false;

  wss = new WebSocket.Server({ port: data.portThrower });

  wss.on("error", () => {
    portInUse = true;
    // Retry server creation after 3 seconds
    setTimeout(() => {
      createServer();
    }, 3000);
  });

  if (!portInUse)
  {
    wss.on("connection", function connection(ws)
    {
      portInUse = false;
      socket = ws;
      
      socket.on("message", function message(request)
      {
        request = JSON.parse(request);
    
        if (request.type == "calibrating")
        {
          switch (request.stage)
          {
            case "min":
              if (request.size > -99)
              {
                calibrateStage = 0;
                calibrate();
              }
              else
              {
                setData(request.modelID + "Min", [ request.positionX, request.positionY ], false);
                calibrateStage = 2;
                calibrate();
              }
              break;
            case "max":
              if (request.size < 99)
              {
                calibrateStage = 2;
                calibrate();
              }
              else
              {
                setData(request.modelID + "Max", [ request.positionX, request.positionY ], false);
                calibrateStage = 4;
                calibrate();
              }
              break;
          }
        }
        else if (request.type == "status")
          connectedBonkerVTube = request.connectedBonkerVTube;
      });
    
      ws.on("close", function message()
      {
        socket = null;
        calibrateStage = -2;
      });
    });
  }
}

// ----------------
// Crowd Control Connection
// ----------------
createCrowdControlConnection();
function createCrowdControlConnection()
{
  cc_socket = io("wss://crowdcontrol.warp.bar");
  cc_socket.on("connect", () => {
    console.log("CC Socket: Connected to Crowd Control!! Socket ID: " + cc_socket.id);
    cc_socket.emit("type", "init");
    cc_socket.emit("events", data.cc_channel);
    console.log("CC Socket: Getting events from channel " + data.cc_channel);
    crowdControlConnected = true;
  });

  cc_socket.on("disconnect", () => {
    console.log("CC Socket: Disconnected from Crowd Control! ");
    crowdControlConnected = false;
  });

  cc_socket.io.on("error", (error) => {
    console.log("CC Socket Error: " + error);
  });

  cc_socket.on("message", (args) => {
    checkCrowdControlEvent(args);
  });
}

// ----------------
// VTube Studio Connection
// ----------------
const vts = new VtubeStudioAgent(data.portVTubeStudio);
var lastCrowdControlEventId = '';
async function checkCrowdControlEvent(event) {
  //console.log(event);
  if(event.hasOwnProperty("effect")) {
    if (lastCrowdControlEventId != event.id+"-"+event.state) {
      lastCrowdControlEventId = event.id+"-"+event.state;
      console.log(`Event intercepted: "${event.effectName}" (effect "${event.effect}", type "${event.type}")`);

      var customEvents = await getData("crowdControlEvents");
      var matchedEvent = null;
      Object.entries(customEvents).forEach(item => {
        const [key, customEvent] = item;
        if(event.effect == customEvent.triggerName && event.type == customEvent.triggerType && customEvent.enabled == true) {
          matchedEvent = customEvent;
          console.log('Found a matching event: ' + key);
        }
      });

      if(matchedEvent) {
        //Execute the bonk if enabled
        if(matchedEvent.bonkEnabled && matchedEvent.bonkType.length > 0) {
          custom(matchedEvent.bonkType);
        }

        //Execute the hotkey(s) if enabled
        if(matchedEvent.hotkeyEnabled && matchedEvent.hotkeyName.length > 0) {
          //Trigger the selected hotkey
          vts.triggerHotkey(matchedEvent.hotkeyName);
          if(matchedEvent.secondHotkeyEnabled && matchedEvent.secondHotkeyName.length > 0) {
            //Trigger the follow-up hotkey after the specified delay
            setTimeout(() => {vts.triggerHotkey(matchedEvent.secondHotkeyName)},matchedEvent.secondHotkeyDelay);
          }
        }

        //Execute the expression if enabled
        if(matchedEvent.expressionEnabled && matchedEvent.expressionName.length > 0) {
          //Activate selected expression
          vts.activateExpression(matchedEvent.expressionName);
          if(parseInt(matchedEvent.expressionDuration) > 0) {
            //Deactivate expression after the listed duration
            setTimeout(() => {vts.deactivateExpression(matchedEvent.expressionName)},matchedEvent.expressionDuration);
          }
        }

      }
    }

  }
  if(event.type === "refresh") {
    console.log("Refresh command received! (This is typically used to clear the overlay.)");
  }
}

// -----------------
// Model Calibration
// -----------------

ipcMain.on("startCalibrate", () => startCalibrate());
ipcMain.on("nextCalibrate", () => nextCalibrate());
ipcMain.on("cancelCalibrate", () => cancelCalibrate());

var calibrateStage = -2;
function startCalibrate()
{
  if (socket != null && connectedBonkerVTube)
  {
    calibrateStage = -1;
    calibrate();
  }
}

function nextCalibrate()
{
  if (socket != null && connectedBonkerVTube)
  {
    calibrateStage++;
    calibrate();
  }
}

function cancelCalibrate()
{
  if (socket != null && connectedBonkerVTube)
  {
    calibrateStage = 4;
    calibrate();
  }
}

function calibrate()
{
  var request = {
    "type": "calibrating",
    "stage": calibrateStage
  }
  socket.send(JSON.stringify(request));
}

// -----
// Bonks
// -----

// Acquire a random image, sound, and associated properties
function getImageWeightScaleSoundVolume()
{
  var index;
  do {
    index = Math.floor(Math.random() * data.throws.length);
  } while (!data.throws[index].enabled);

  var soundIndex = -1;
  if (hasActiveSound())
  {
    do {
      soundIndex = Math.floor(Math.random() * data.impacts.length);
    } while (!data.impacts[soundIndex].enabled);
  }

  return {
    "location": data.throws[index].location,
    "weight": data.throws[index].weight,
    "scale": data.throws[index].scale,
    "sound": data.throws[index].sound != null ? data.throws[index].sound : soundIndex != -1 ? data.impacts[soundIndex].location : null,
    "volume": data.throws[index].volume * (soundIndex != -1 ? data.impacts[soundIndex].volume : 1)
  };
}

// Acquire a set of images, sounds, and associated properties for a default barrage
function getImagesWeightsScalesSoundsVolumes(customAmount)
{
  var getImagesWeightsScalesSoundsVolumes = [];

  var count = customAmount == null ? data.barrageCount : customAmount;
  for (var i = 0; i < count; i++)
    getImagesWeightsScalesSoundsVolumes.push(getImageWeightScaleSoundVolume());

  return getImagesWeightsScalesSoundsVolumes;
}

// Test Events
ipcMain.on("single", () => single());
ipcMain.on("barrage", () => barrage());

// Testing a specific item
ipcMain.on("testItem", (event, message) => testItem(event, message));

function testItem(_, item)
{
  console.log("Testing Item");
  if (socket != null)
  {
    var soundIndex = -1;
    if (hasActiveSound())
    {
      do {
        soundIndex = Math.floor(Math.random() * data.impacts.length);
      } while (!data.impacts[soundIndex].enabled);
    }
    
    var request =
    {
      "type": "single",
      "image": item.location,
      "weight": item.weight,
      "scale": item.scale,
      "sound": item.sound == null && soundIndex != -1 ? data.impacts[soundIndex].location : item.sound,
      "volume": item.volume,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// A single random bonk
function single()
{
  console.log("Sending Single");
  if (socket != null && hasActiveImage()) {
    const imageWeightScaleSoundVolume = getImageWeightScaleSoundVolume();

    var request =
    {
      "type": "single",
      "image": imageWeightScaleSoundVolume.location,
      "weight": imageWeightScaleSoundVolume.weight,
      "scale": imageWeightScaleSoundVolume.scale,
      "sound": imageWeightScaleSoundVolume.sound,
      "volume": imageWeightScaleSoundVolume.volume,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// A random barrage of bonks
function barrage(customAmount)
{
  console.log("Sending Barrage");
  if (socket != null && hasActiveImage()) {
    const imagesWeightsScalesSoundsVolumes = getImagesWeightsScalesSoundsVolumes(customAmount);
    var images = [], weights = [], scales = [], sounds = [], volumes = [];
    for (var i = 0; i < imagesWeightsScalesSoundsVolumes.length; i++) {
      images[i] = imagesWeightsScalesSoundsVolumes[i].location;
      weights[i] = imagesWeightsScalesSoundsVolumes[i].weight;
      scales[i] = imagesWeightsScalesSoundsVolumes[i].scale;
      sounds[i] = imagesWeightsScalesSoundsVolumes[i].sound;
      volumes[i] = imagesWeightsScalesSoundsVolumes[i].volume;
    }

    var request = {
      "type": "barrage",
      "image": images,
      "weight": weights,
      "scale": scales,
      "sound": sounds,
      "volume": volumes,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// Acquire an image, sound, and associated properties for a custom bonk
function getCustomImageWeightScaleSoundVolume(customName)
{
  var index;
  if (data.customBonks[customName].itemsOverride && hasActiveImageCustom(customName))
  {
    do {
      index = Math.floor(Math.random() * data.throws.length);
    } while (!data.throws[index].customs.includes(customName));
  }
  else
  {
    do {
      index = Math.floor(Math.random() * data.throws.length);
    } while (!data.throws[index].enabled);
  }

  var soundIndex = -1;
  if (data.customBonks[customName].soundsOverride && hasActiveSoundCustom(customName))
  {
    do {
      soundIndex = Math.floor(Math.random() * data.impacts.length);
    } while (!data.impacts[soundIndex].customs.includes(customName));
  }
  else if (hasActiveSound())
  {
    do {
      soundIndex = Math.floor(Math.random() * data.impacts.length);
    } while (!data.impacts[soundIndex].enabled);
  }

  var impactDecalIndex = -1;
  if (hasActiveImpactDecal(customName))
  {
    do {
      impactDecalIndex = Math.floor(Math.random() * data.customBonks[customName].impactDecals.length);
    } while (!data.customBonks[customName].impactDecals[impactDecalIndex].enabled);
  }

  var windupSoundIndex = -1;
  if (hasActiveWindupSound(customName))
  {
    do {
      windupSoundIndex = Math.floor(Math.random() * data.customBonks[customName].windupSounds.length);
    } while (!data.customBonks[customName].windupSounds[windupSoundIndex].enabled);
  }

  return {
    "location": data.throws[index].location,
    "weight": data.throws[index].weight,
    "scale": data.throws[index].scale,
    "sound": data.throws[index].sound != null ? data.throws[index].sound : (soundIndex != -1 ? data.impacts[soundIndex].location : null),
    "volume": data.throws[index].volume * (soundIndex != -1 ? data.impacts[soundIndex].volume : 1),
    "impactDecal": impactDecalIndex != -1 ? data.customBonks[customName].impactDecals[impactDecalIndex] : null,
    "windupSound": windupSoundIndex != -1 ? data.customBonks[customName].windupSounds[windupSoundIndex] : null
  };
}

// Acquire a set of images, sounds, and associated properties for a custom bonk
function getCustomImagesWeightsScalesSoundsVolumes(customName)
{
  var getImagesWeightsScalesSoundsVolumes = [];

  for (var i = 0; i < data.customBonks[customName].barrageCount; i++)
    getImagesWeightsScalesSoundsVolumes.push(getCustomImageWeightScaleSoundVolume(customName));

  return getImagesWeightsScalesSoundsVolumes;
}

ipcMain.on("testCustomBonk", (_, message) => { custom(message); });

// A custom bonk test
function custom(customName)
{
  console.log("Sending Custom");
  if (socket != null && hasActiveImageCustom(customName)) {
    const imagesWeightsScalesSoundsVolumes = getCustomImagesWeightsScalesSoundsVolumes(customName);
    var images = [], weights = [], scales = [], sounds = [], volumes = [], impactDecals = [], windupSounds = [];
    for (var i = 0; i < imagesWeightsScalesSoundsVolumes.length; i++) {
      images[i] = imagesWeightsScalesSoundsVolumes[i].location;
      weights[i] = imagesWeightsScalesSoundsVolumes[i].weight;
      scales[i] = imagesWeightsScalesSoundsVolumes[i].scale;
      sounds[i] = imagesWeightsScalesSoundsVolumes[i].sound;
      volumes[i] = imagesWeightsScalesSoundsVolumes[i].volume;
      impactDecals[i] = imagesWeightsScalesSoundsVolumes[i].impactDecal;
      windupSounds[i] = imagesWeightsScalesSoundsVolumes[i].windupSound;
    }

    var request = {
      "type": customName,
      "image": images,
      "weight": weights,
      "scale": scales,
      "sound": sounds,
      "volume": volumes,
      "impactDecal": impactDecals,
      "windupSound": windupSounds,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// ----
// Data
// ----

ipcMain.on("setData", (_, arg) =>
{
  setData(arg[0], arg[1], true);
});

function setData(field, value, external)
{
  data[field] = value;
  fs.writeFileSync(__dirname + "/data.json", JSON.stringify(data));
  if(field == "portVTubeStudio") {
    vts.setPort(value);
  }
  if (external)
    mainWindow.webContents.send("doneWriting");
}

function hasActiveImage()
{
  if (data.throws == null || data.throws.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.throws.length; i++)
  {
    if (data.throws[i].enabled)
    {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveImageCustom(customName)
{
  if (!data.customBonks[customName].itemsOverride)
    return hasActiveImage();

  if (data.throws == null || data.throws.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.throws.length; i++)
  {
    if (data.throws[i].customs.includes(customName))
    {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveImpactDecal(customName)
{
  if (data.customBonks[customName].impactDecals == null || data.customBonks[customName].impactDecals.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.customBonks[customName].impactDecals.length; i++)
  {
    if (data.customBonks[customName].impactDecals[i].enabled)
    {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveWindupSound(customName)
{
  if (data.customBonks[customName].windupSounds == null || data.customBonks[customName].windupSounds.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.customBonks[customName].windupSounds.length; i++)
  {
    if (data.customBonks[customName].windupSounds[i].enabled)
    {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveSound()
{
  if (data.impacts == null || data.impacts.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.impacts.length; i++)
  {
    if (data.impacts[i].enabled)
    {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveSoundCustom(customName)
{
  if (!data.customBonks[customName].soundsOverride)
    return hasActiveSound();

  if (data.impacts == null || data.impacts.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.impacts.length; i++)
  {
    if (data.impacts[i].customs.includes(customName))
    {
      active = true;
      break;
    }
  }
  return active;
}