// Karasubot Websocket Scripts

var socketKarasu, karasuIsOpen = false;
var isCalibrating = false;

function endCalibration()
{
    if (isCalibrating)
    {
        isCalibrating = false;
        document.querySelector("#guide").hidden = true;
        document.querySelector("#guideText").hidden = true;
        if (vTubeIsOpen)
        {
            var request = {
                "apiName": "VTubeStudioPublicAPI",
                "apiVersion": "1.0",
                "requestID": "9",
                "messageType": "MoveModelRequest",
                "data": {
                    "timeInSeconds": 0.5,
                    "valuesAreRelativeToModel": false,
                    "positionX": 0.0,
                    "positionY": 0.0,
                    "rotation": 0,
                    "size": 0
                }
            }
            socketVTube.onmessage = null;
            socketVTube.send(JSON.stringify(request));
        }
    }
}

function connectKarasu()
{
    socketKarasu = new WebSocket("ws://localhost:" + ports[0]);
    socketKarasu.onopen = function()
    {
        karasuIsOpen = true;
        console.log("Connected to Karasubot!");

        // Stop attempting to reconnect unless we lose connection
        clearInterval(tryConnectKarasu);
        tryConnectKarasu = setInterval(function()
        {
            if (socketKarasu.readyState != 1)
            {
                karasuIsOpen = false;
                console.log("Lost connection to Karasubot!");
                endCalibration();
                clearInterval(tryConnectKarasu);
                tryConnectKarasu = setInterval(retryConnectKarasu, 1000 * 3);
            }
        }, 1000 * 3);
    };

    // Process incoming requests
    socketKarasu.onmessage = function(event)
    {
        var data = JSON.parse(event.data);

        if (data.type == "calibrating")
        {
            isCalibrating = true;
            document.querySelector("#guide").hidden = false;
            document.querySelector("#guideText").hidden = false;
            switch(data.stage)
            {
                // Stage 0 is calibrating at smallest size
                case 0:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "7",
                        "messageType": "MoveModelRequest",
                        "data": {
                            "timeInSeconds": 0.5,
                            "valuesAreRelativeToModel": false,
                            "positionX": 0.0,
                            "positionY": 0.0,
                            "rotation": 0,
                            "size": -100
                        }
                    }
                    socketVTube.onmessage = null;
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 1 is sending min size position information back
                case 1:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "4",
                        "messageType": "CurrentModelRequest"
                    }
                    socketVTube.onmessage = function(event)
                    {
                        request = {
                            "type": "calibrating",
                            "stage": "min",
                            "positionX": JSON.parse(event.data).data.modelPosition.positionX,
                            "positionY": JSON.parse(event.data).data.modelPosition.positionY,
                            "size": JSON.parse(event.data).data.modelPosition.size,
                            "modelID": JSON.parse(event.data).data.modelID
                        }
                        socketVTube.onmessage = null;
                        socketKarasu.send(JSON.stringify(request));
                    }
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 2 is calibrating at largest size
                case 2:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "9",
                        "messageType": "MoveModelRequest",
                        "data": {
                            "timeInSeconds": 0.5,
                            "valuesAreRelativeToModel": false,
                            "positionX": 0.0,
                            "positionY": 0.0,
                            "rotation": 0,
                            "size": 100
                        }
                    }
                    socketVTube.onmessage = null;
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 3 is sending max size position information back
                case 3:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "4",
                        "messageType": "CurrentModelRequest"
                    }
                    socketVTube.onmessage = function(event)
                    {
                        request = {
                            "type": "calibrating",
                            "stage": "max",
                            "positionX": JSON.parse(event.data).data.modelPosition.positionX,
                            "positionY": JSON.parse(event.data).data.modelPosition.positionY,
                            "size": JSON.parse(event.data).data.modelPosition.size,
                            "modelID": JSON.parse(event.data).data.modelID
                        }
                        socketVTube.onmessage = null;
                        socketKarasu.send(JSON.stringify(request));
                    }
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 4 is finishing calibration
                case 4:
                    endCalibration();
                    break;
            }
        }
        else if (!isCalibrating && vTubeIsOpen)
        {
            var request = {
                "apiName": "VTubeStudioPublicAPI",
                "apiVersion": "1.0",
                "requestID": "3",
                "messageType": "InputParameterListRequest"
            }
            socketVTube.onmessage = function(event)
            {
                const paramInfo = JSON.parse(event.data).data.defaultParameters;
                const modelID = JSON.parse(event.data).data.modelID;
                
                const faceWidthMin = data.data[modelID + "Min"][0];
                const faceHeightMin = data.data[modelID + "Min"][1];
                const faceWidthMax = data.data[modelID + "Max"][0];
                const faceHeightMax = data.data[modelID + "Max"][1];

                for (var i = 0; i < data.data.parametersHorizontal.length; i++)
                {
                    var value = 0, min = -30, max = 30;
                    for (var j = 0; j < paramInfo.length; j++)
                    {
                        if (paramInfo[j].name == data.data.parametersHorizontal[i])
                        {
                            value = paramInfo[j].value;
                            min = paramInfo[j].min;
                            max = paramInfo[j].max;
                            break;
                        }
                    }
                    data.data.parametersHorizontal[i] = [ data.data.parametersHorizontal[i], value, min, max ];
                }

                for (var i = 0; i < data.data.parametersVertical.length; i++)
                {
                    var value = 0, min = -30, max = 30;
                    for (var j = 0; j < paramInfo.length; j++)
                    {
                        if (paramInfo[j].name == data.data.parametersVertical[i])
                        {
                            value = paramInfo[j].value;
                            min = paramInfo[j].min;
                            max = paramInfo[j].max;
                            break;
                        }
                    }
                    data.data.parametersVertical[i] = [ data.data.parametersVertical[i], value, min, max ];
                }

                console.log("Received " + data.type);

                switch(data.type)
                {
                    case "single":
                        bonk(data.image, data.weight, data.scale, data.sound, data.volume, data.data.volume, data.data.parametersHorizontal, data.data.parametersVertical, data.data.delay, data.data.returnSpeed, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax);
                        break;
                    case "barrage":
                        var i = 0;
                        const images = data.image;
                        const weights = data.weight;
                        const scales = data.scale;
                        const sounds = data.sound;
                        const volumes = data.volume;
                        const max = Math.min(images.length, sounds.length, weights.length);

                        var bonker = setInterval(function()
                        {
                            bonk(images[i], weights[i], scales[i], sounds[i], volumes[i], data.data.volume, data.data.parametersHorizontal, data.data.parametersVertical, data.data.delay, data.data.returnSpeed, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax);
                            if (++i >= max)
                                clearInterval(bonker);
                        }, data.data.barrageFrequency * 1000);
                        break;
                }
            }
            socketVTube.send(JSON.stringify(request));
        }
    }
}

connectKarasu();
// Retry connection to Karasubot every 5 seconds
var tryConnectKarasu = setInterval(retryConnectKarasu, 1000 * 3);

function retryConnectKarasu()
{
    console.log("Retrying connection to Karasubot...");
    connectKarasu();
}

// VTube Studio API Scripts

var socketVTube;
var vTubeIsOpen = false;

function connectVTube()
{
    socketVTube = new WebSocket("ws://localhost:" + ports[1]);
    socketVTube.onopen = function()
    {
        console.log("Connected to VTube Studio!");

        var request = {
            "apiName": "VTubeStudioPublicAPI",
            "apiVersion": "1.0",
            "requestID": "0",
            "messageType": "AuthenticationTokenRequest",
            "data": {
                "pluginName": "Karasubonk",
                "pluginDeveloper": "typeou.dev",
                "pluginIcon": "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"
            }
        }
        socketVTube.onmessage = function(event)
        {
            socketVTube.onmessage = null;
            var response = JSON.parse(event.data);
            if (response.data.authenticationToken != null)
            {
                request = {
                    "apiName": "VTubeStudioPublicAPI",
                    "apiVersion": "1.0",
                    "requestID": "1",
                    "messageType": "AuthenticationRequest",
                    "data": {
                        "pluginName": "Karasubonk", 
                        "pluginDeveloper": "typeou.dev",
                        "authenticationToken": response.data.authenticationToken
                    }
                }
                socketVTube.onmessage = function(event)
                {
                    socketVTube.onmessage = null;
                    response = JSON.parse(event.data);
                    if (response.data.authenticated)
                        vTubeIsOpen = true;
                }
                socketVTube.send(JSON.stringify(request));
            }
        }
        socketVTube.send(JSON.stringify(request));
    };
}

connectVTube();

// Report status of VTube studio connection once a second
setInterval(() => {
    if (karasuIsOpen)
    {
        var request = {
            "type": "status",
            "connectedVTube": vTubeIsOpen
        }
        socketKarasu.send(JSON.stringify(request));
    }
}, 1000);

function bonk(image, weight, scale, sound, volume, volumeGlobal, paramH, paramV, delay, returnSpeed, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax)
{
    if (vTubeIsOpen)
    {
        var request = {
            "apiName": "VTubeStudioPublicAPI",
            "apiVersion": "1.0",
            "requestID": "4",
            "messageType": "CurrentModelRequest"
        }
        socketVTube.onmessage = function(event)
        {
            const pos = JSON.parse(event.data).data.modelPosition;
            if (pos != null)
            {
                const offsetX = faceWidthMin + (((pos.size + 100) / 200) * (faceWidthMax - faceWidthMin));
                const offsetY = faceHeightMin + (((pos.size + 100) / 200) * (faceHeightMax - faceHeightMin));
                const xPos = (parseFloat(pos.positionX - offsetX) + 1) / 2, yPos = 1 - ((parseFloat(pos.positionY - offsetY) + 1) / 2);
                const fromLeft = Math.random() < xPos;
                const multH = fromLeft ? 1 : -1;
                const angle = (Math.random() * 90) - 45;

                if (sound != null)
                {
                    var audio = new Audio();
                    audio.src = "impacts/" + encodeURIComponent(sound.substr(8));
                    console.log(audio.src);
                    audio.volume = ((weight / 2) + 0.5) * volume * volumeGlobal;
                    var canPlayAudio = false;
                    audio.oncanplaythrough = function() { canPlayAudio = true; }
                }
                else
                    canPlayAudio = true;

                var img = new Image();
                img.src = "throws/" + encodeURIComponent(image.substr(7));
                console.log(img.src);
                img.onload = function()
                {
                    var pivot = document.createElement("div");
                    pivot.classList.add("thrown");
                    pivot.style.left = ((window.innerWidth * xPos) - (img.width / 2)) + "px";
                    pivot.style.top = ((window.innerHeight * yPos) - (img.height / 2)) + "px";
                    pivot.style.transform = "rotate(" + angle + "deg)";
                    var movement = document.createElement("div");
                    movement.classList.add("animated");
                    var animName = "throw" + (fromLeft ? "Left" : "Right");
                    movement.style.animation = animName + " 0.8s " + (delay / 1000) + "s";
                    var thrown = document.createElement("img");
                    thrown.classList.add("animated");
                    thrown.src = image;
                    thrown.style.width = img.width * scale + "px";
                    thrown.style.height = img.height * scale + "px";
                    var animName = "spin" + (Math.random() < 0.5 ? "Clockwise " : "CounterClockwise ");
                    thrown.style.animation = animName + ((Math.random() * 0.4) + 0.1) + "s";
                    thrown.style.animationIterationCount = "infinite";
                    
                    movement.appendChild(thrown);
                    pivot.appendChild(movement);
                    document.querySelector("body").appendChild(pivot);


                    // Don't do anything until both image and audio are ready
                    if (canPlayAudio)
                    {
                        setTimeout(function() { flinch(multH, angle, weight, paramH, paramV, returnSpeed); }, 300);

                        if (sound != null)
                            setTimeout(function() { audio.play(); }, 300 + delay);
                        
                        setTimeout(function() { document.querySelector("body").removeChild(pivot); }, 800 + delay);
                    }
                    else
                    {
                        audio.oncanplaythrough = function()
                        {
                            setTimeout(function() { flinch(multH, angle, weight, paramH, paramV, returnSpeed); }, 300);

                            setTimeout(function() { audio.play(); }, 300 + delay);
                            
                            setTimeout(function() { document.querySelector("body").removeChild(pivot); }, 800 + delay);
                        }
                    }
                }
            }
        }
        socketVTube.send(JSON.stringify(request));
    }
}

function flinch(multH, angle, mag, paramH, paramV, returnSpeed)
{
    var parameterValues = [];
    for (var i = 0; i < paramH.length; i++)
        parameterValues.push({ "id": paramH[i][0], "value": paramH[i][1] + (multH < 0 ? paramH[i][2] : paramH[i][3]) * mag });
    for (var i = 0; i < paramV.length; i++)
        parameterValues.push({ "id": paramV[i][0], "value": paramV[i][1] + (angle > 0 ? paramV[i][2] : paramV[i][3]) * Math.abs(angle) / 45 * mag });

    var request = {
        "apiName": "VTubeStudioPublicAPI",
        "apiVersion": "1.0",
        "requestID": "5",
        "messageType": "InjectParameterDataRequest",
        "data": {
            "parameterValues": parameterValues
        }
    }

    var weight = 1, done;
    socketVTube.onmessage = function()
    {
        weight -= returnSpeed;
        done = weight <= 0;
        if (done)
            weight = 0;

        parameterValues = [];
        for (var i = 0; i < paramH.length; i++)
            parameterValues.push({ "id": paramH[i][0], "weight": weight, "value": paramH[i][1] + (multH < 0 ? paramH[i][2] : paramH[i][3]) * mag });
        for (var i = 0; i < paramV.length; i++)
            parameterValues.push({ "id": paramV[i][0], "weight": weight, "value": paramV[i][1] + (multH * angle > 0 ? paramV[i][2] : paramV[i][3]) * Math.abs(angle) / 45 * mag });

        request = {
            "apiName": "VTubeStudioPublicAPI",
            "apiVersion": "1.0",
            "requestID": "6",
            "messageType": "InjectParameterDataRequest",
            "data": {
                "parameterValues": parameterValues
            }
        }

        socketVTube.send(JSON.stringify(request));
        if (done)
            socketVTube.onmessage = null;
    };
    socketVTube.send(JSON.stringify(request));
}