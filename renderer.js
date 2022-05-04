const { ipcRenderer } = require("electron");
const fs = require("fs");
const axios = require("axios");

const version = 0.1;

// ------
// Status
// ------

var status = 0;

const statusTitle = [
    "Ready!",
    "Connecting to CrowdControl...",
    "Connecting to Browser Source...",
    "Calibrating (1/2)",
    "Calibrating (2/2)",
    "Connecting Bonker to VTube Studio...",
    "",
    "Calibration",
    "Connecting Bot to VTube Studio...",
    "Error: Port In Use"
];

const statusDesc = [
    "",
    "<p>We're currently connecting to Crowd Control</p>",
    "<p>If this message doesn't disappear after a few seconds, please refresh the JayoBonk Browser Source in OBS.</p><p>The JayoBonk Browser Source should be active with <mark>jayobonk/resources/app/bonker.html</mark> as the source file.</p>",
    "<p>Please use VTube Studio to position your model's head under the guide being displayed in OBS.</p><p>Your VTube Studio Source and JayoBonk Browser Source should be overlapping.</p><p>Press the <mark>Continue Calibration</mark> button below to continue to the next step.</p>",
    "<p>Please use VTube Studio to position your model's head under the guide being displayed in OBS.</p><p>Your VTube Studio Source and JayoBonk Browser Source should be overlapping.</p><p>Press the <mark>Confirm Calibration</mark> button below to finish calibration.</p>",
    [ "<p>If this message doesn't disappear after a few seconds, please refresh the JayoBonk Browser Source.</p><p>If that doesn't work, please ensure the VTube Studio API is enabled on port <mark>", "</mark>.</p>" ],
    "<p></p>",
    "<p>This short process will decide the impact location of thrown objects.</p><p>Please click \"Start Calibration\" to start the calibration process.</p>",
    "<p></p>",
    [ "<p>The port <mark>", "</mark> is already in use. Another process may be using this port.</p><p>Try changing the Browser Source Port in Settings, under Advanced Settings.</p><p>It should be some number between 1024 and 65535.</p>"]
];

ipcRenderer.on("status", (event, message) => { setStatus(event, message); });

async function setStatus(_, message)
{
    status = message;
    document.querySelector("#status").innerHTML = statusTitle[status];
    document.querySelector("#headerStatusInner").innerHTML = statusTitle[status] + (status != 0 ? " (Click)" : "");

    if (status == 0)
    {
        document.querySelector("#headerStatus").classList.remove("errorText");
        document.querySelector("#headerStatus").classList.remove("workingText");
        document.querySelector("#headerStatus").classList.add("readyText");
    }
    else if (status == 9)
    {
        document.querySelector("#headerStatus").classList.add("errorText");
        document.querySelector("#headerStatus").classList.remove("workingText");
        document.querySelector("#headerStatus").classList.remove("readyText");
    }
    else
    {
        document.querySelector("#headerStatus").classList.remove("errorText");
        document.querySelector("#headerStatus").classList.add("workingText");
        document.querySelector("#headerStatus").classList.remove("readyText");
    }

    if (status == 5)
        document.querySelector("#statusDesc").innerHTML = statusDesc[status][0] + await getData("portVTubeStudio") + statusDesc[status][1];
    else if (status == 9)
        document.querySelector("#statusDesc").innerHTML = statusDesc[status][0] + await getData("portThrower") + statusDesc[status][1];
    else
        document.querySelector("#statusDesc").innerHTML = statusDesc[status];

    if (status == 3 || status == 4 || status == 7)
    {
        if (status == 7)
            document.querySelector("#nextCalibrate").querySelector(".innerTopButton").innerText = "Start Calibration";
        else if (status == 3)
            document.querySelector("#nextCalibrate").querySelector(".innerTopButton").innerText = "Continue Calibration";
        else if (status == 4)
            document.querySelector("#nextCalibrate").querySelector(".innerTopButton").innerText = "Confirm Calibration";
        document.querySelector("#calibrateButtons").classList.remove("hidden");
    }
    else
        document.querySelector("#calibrateButtons").classList.add("hidden");
}

// ---------
// Libraries
// ---------

// Adding a new image to the list
document.querySelector("#newImage").addEventListener("click", () => { document.querySelector("#loadImage").click(); });
document.querySelector("#loadImage").addEventListener("change", loadImage);

async function loadImage()
{
    var throws = await getData("throws");
    var files = document.querySelector("#loadImage").files;
    for (var i = 0; i < files.length; i++)
    {
        // Grab the image that was just loaded
        var imageFile = files[i];
        // If the folder for objects doesn't exist for some reason, make it
        if (!fs.existsSync(__dirname + "/throws/"))
            fs.mkdirSync(__dirname + "/throws/");
    
        // Ensure that we're not overwriting any existing files with the same name
        // If a file already exists, add an interating number to the end until it"s a unique filename
        var append = "";
        if (imageFile.path != __dirname + "\\throws\\" + imageFile.name)
            while (fs.existsSync(__dirname + "/throws/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));
    
        // Make a copy of the file into the local folder
        fs.copyFileSync(imageFile.path, __dirname + "/throws/" + filename);
        
        // Add the new image, update the data, and refresh the images page
        throws.unshift({
            "enabled": true,
            "location": "throws/" + filename,
            "weight": 1.0,
            "scale": 1.0,
            "sound": null,
            "volume": 1.0,
            "customs": []
        });
    }
    setData("throws", throws);
    openImages();
    
    // Reset the image upload
    document.querySelector("#loadImage").value = null;
}

document.querySelector("#imageTable").querySelector(".selectAll input").addEventListener("change", async () => {
    document.querySelector("#imageTable").querySelectorAll(".imageEnabled").forEach((element) => { 
        element.checked = document.querySelector("#imageTable").querySelector(".selectAll input").checked;
    });
    var throws = await getData("throws");
    for (var i = 0; i < throws.length; i++)
        throws[i].enabled = document.querySelector("#imageTable").querySelector(".selectAll input").checked;
    setData("throws", throws);
});

async function openImages()
{
    var throws = await getData("throws");

    document.querySelector("#imageTable").querySelectorAll(".imageRow").forEach((element) => { element.remove(); });
    
    var allEnabled = true;
    for (var i = 0; i < throws.length; i++)
    {
        if (!throws[i].enabled)
        {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#imageTable").querySelector(".selectAll input").checked = allEnabled;

    if (throws == null)
        setData("throws", []);
    else
    {
        throws.forEach((_, index) =>
        {
            if (fs.existsSync(__dirname + "/" + throws[index].location))
            {
                var row = document.querySelector("#imageRow").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("imageRow");
                row.removeAttribute("hidden");
                document.querySelector("#imageTable").appendChild(row);

                row.querySelector(".imageLabel").innerText = throws[index].location.substr(throws[index].location.lastIndexOf('/') + 1);
    
                row.querySelector(".imageImage").src = throws[index].location;

                row.querySelector(".imageEnabled").checked = throws[index].enabled;
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    throws[index].enabled = row.querySelector(".imageEnabled").checked;
                    setData("throws", throws);

                    var allEnabled = true;
                    for (var i = 0; i < throws.length; i++)
                    {
                        if (!throws[i].enabled)
                        {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#imageTable").querySelector(".selectAll input").checked = allEnabled;
                });

                row.querySelector(".imageDetails").addEventListener("click", () => {
                    currentImageIndex = index;
                    openImageDetails();
                    showPanel("imageDetails", true);
                });

                row.querySelector(".imageRemove").addEventListener("click", () => {
                    throws.splice(index, 1);
                    setData("throws", throws);
                    openImages();
                });
            }
            else
            {
                throws.splice(index, 1);
                setData("throws", throws);
            }
        });
    }
}

async function loadImageCustom(customName)
{
    var throws = await getData("throws");
    var files = document.querySelector("#loadImageCustom").files;
    for (var i = 0; i < files.length; i++)
    {
        // Grab the image that was just loaded
        var imageFile = files[i];
        // If the folder for objects doesn't exist for some reason, make it
        if (!fs.existsSync(__dirname + "/throws/"))
            fs.mkdirSync(__dirname + "/throws/");
    
        // Ensure that we're not overwriting any existing files with the same name
        // If a file already exists, add an interating number to the end until it"s a unique filename
        var append = "";
        if (imageFile.path != __dirname + "\\throws\\" + imageFile.name)
            while (fs.existsSync(__dirname + "/throws/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));
    
        // Make a copy of the file into the local folder
        fs.copyFileSync(imageFile.path, __dirname + "/throws/" + filename);
        
        // Add the new image, update the data, and refresh the images page
        throws.unshift({
            "enabled": false,
            "location": "throws/" + filename,
            "weight": 1.0,
            "scale": 1.0,
            "sound": null,
            "volume": 1.0,
            "customs": [ customName ]
        });
    }
    setData("throws", throws);
    openImagesCustom(customName);
    
    // Reset the image upload
    document.querySelector("#loadImageCustom").value = null;
}

async function openImagesCustom(customName)
{
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#imageTableCustom");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newImageCustom").addEventListener("click", () => { document.querySelector("#loadImageCustom").click(); });
    document.querySelector("#loadImageCustom").addEventListener("change", () => { loadImageCustom(customName); });
    
    var throws = await getData("throws");

    var allEnabled = true;
    for (var i = 0; i < throws.length; i++)
    {
        if (!throws[i].customs.includes(customName))
        {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#imageTableCustom").querySelector(".selectAll input").addEventListener("change", () => {
        document.querySelector("#imageTableCustom").querySelectorAll(".imageEnabled").forEach((element) => { 
            element.checked = document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < throws.length; i++)
        {
            if (document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked && !throws[i].customs.includes(customName))
                throws[i].customs.push(customName);
            else if (!document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked && throws[i].customs.includes(customName))
                throws[i].customs.splice(throws[i].customs.indexOf(customName), 1);
        }
        setData("throws", throws);
    });

    document.querySelector("#imageTableCustom").querySelectorAll(".imageRow").forEach((element) => { element.remove(); });

    if (throws == null)
        setData("throws", []);
    else
    {
        throws.forEach((_, index) =>
        {
            if (fs.existsSync(__dirname + "/" + throws[index].location))
            {
                var row = document.querySelector("#imageRowCustom").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("imageRow");
                row.removeAttribute("hidden");
                document.querySelector("#imageTableCustom").appendChild(row);

                row.querySelector(".imageLabel").innerText = throws[index].location.substr(throws[index].location.lastIndexOf('/') + 1);
    
                row.querySelector(".imageImage").src = throws[index].location;

                row.querySelector(".imageEnabled").checked = throws[index].customs.includes(customName);
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    if (!row.querySelector(".imageEnabled").checked && throws[index].customs.includes(customName))
                        throws[index].customs.splice(throws[index].customs.indexOf(customName), 1);
                    else if (row.querySelector(".imageEnabled").checked && !throws[index].customs.includes(customName))
                        throws[index].customs.push(customName);
                    setData("throws", throws);

                    var allEnabled = true;
                    for (var i = 0; i < throws.length; i++)
                    {
                        if (!throws[i].customs.includes(customName))
                        {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked = allEnabled;
                });
            }
            else
            {
                throws.splice(index, 1);
                setData("throws", throws);
            }
        });
    }
}

async function loadSoundCustom(customName)
{
    var impacts = await getData("impacts");
    var files = document.querySelector("#loadSoundCustom").files;
    for (var i = 0; i < files.length; i++)
    {
        var soundFile = files[i];
        if (!fs.existsSync(__dirname + "/impacts/"))
            fs.mkdirSync(__dirname + "/impacts/");

        var append = "";
        if (soundFile.path != __dirname + "\\impacts\\" + soundFile.name)
            while (fs.existsSync( __dirname + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, __dirname + "/impacts/" + filename);

        impacts.unshift({
            "location": "impacts/" + filename,
            "volume": 1.0,
            "enabled": false,
            "customs": [ customName ]
        });
    }
    setData("impacts", impacts);
    openSoundsCustom(customName);
    
    document.querySelector("#loadSoundCustom").value = null;
}

async function openSoundsCustom(customName)
{
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#soundTableCustom");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newSoundCustom").addEventListener("click", () => { document.querySelector("#loadSoundCustom").click(); });
    document.querySelector("#loadSoundCustom").addEventListener("change", () => { loadSoundCustom(customName); });

    var impacts = await getData("impacts");

    var allEnabled = true;
    for (var i = 0; i < impacts.length; i++)
    {
        if (!impacts[i].customs.includes(customName))
        {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#soundTableCustom").querySelector(".selectAll input").addEventListener("change", () => {
        document.querySelector("#soundTableCustom").querySelectorAll(".imageEnabled").forEach((element) => { 
            element.checked = document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < impacts.length; i++)
        {
            if (document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked && !impacts[i].customs.includes(customName))
                impacts[i].customs.push(customName);
            else if (!document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked && impacts[i].customs.includes(customName))
                impacts[i].customs.splice(impacts[i].customs.indexOf(customName), 1);
        }
        setData("impacts", impacts);
    });
    
    document.querySelector("#soundTableCustom").querySelectorAll(".soundRow").forEach((element) => { element.remove(); });

    if (impacts == null)
        setData("impacts", []);
    else
    {
        impacts.forEach((_, index) =>
        {
            if (fs.existsSync(__dirname + "/" + impacts[index].location))
            {
                var row = document.querySelector("#soundRowCustom").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("soundRow");
                row.removeAttribute("hidden");
                row.querySelector(".imageLabel").innerText = impacts[index].location.substr(impacts[index].location.lastIndexOf('/') + 1);
                document.querySelector("#soundTableCustom").appendChild(row);

                row.querySelector(".imageEnabled").checked = impacts[index].customs.includes(customName);
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    if (!row.querySelector(".imageEnabled").checked && impacts[index].customs.includes(customName))
                        impacts[index].customs.splice(impacts[index].customs.indexOf(customName), 1);
                    else if (row.querySelector(".imageEnabled").checked && !impacts[index].customs.includes(customName))
                        impacts[index].customs.push(customName);
                    setData("impacts", impacts);

                    for (var i = 0; i < impacts.length; i++)
                    {
                        if (!impacts[i].customs.includes(customName))
                        {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked = allEnabled;
                });
            }
            else
            {
                impacts.splice(index, 1);
                setData("impacts", impacts);
            }
        });
    }
}

async function loadImpactDecal(customName)
{
    var customBonks = await getData("customBonks");
    var files = document.querySelector("#loadImpactDecal").files;
    for (var i = 0; i < files.length; i++)
    {
        var imageFile = files[i];
        if (!fs.existsSync(__dirname + "/decals/"))
            fs.mkdirSync(__dirname + "/decals/");

        var append = "";
        if (imageFile.path != __dirname + "\\decals\\" + imageFile.name)
            while (fs.existsSync(__dirname + "/decals/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));

        fs.copyFileSync(imageFile.path, __dirname + "/decals/" + filename);

        customBonks[customName].impactDecals.unshift({
            "location": "decals/" + filename,
            "duration": 0.25,
            "scale": 1,
            "enabled": true
        });
    }
    setData("customBonks", customBonks);
    openImpactDecals(customName);
    
    document.querySelector("#loadImpactDecal").value = null;
}

async function openImpactDecals(customName)
{
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#impactDecalsTable");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newImpactDecal").addEventListener("click", () => { document.querySelector("#loadImpactDecal").click(); });
    document.querySelector("#loadImpactDecal").addEventListener("change", () => { loadImpactDecal(customName) });

    var customBonks = await getData("customBonks");

    var allEnabled = true;
    for (var i = 0; i < customBonks[customName].impactDecals.length; i++)
    {
        if (!customBonks[customName].impactDecals[i].enabled)
        {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#impactDecalsTable").querySelector(".selectAll input").addEventListener("change", async () => {
        document.querySelector("#impactDecalsTable").querySelectorAll(".imageEnabled").forEach((element) => { 
            element.checked = document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < customBonks[customName].impactDecals.length; i++)
            customBonks[customName].impactDecals[i].enabled = document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked;
        setData("customBonks", customBonks);
    });
    
    document.querySelector("#impactDecalsTable").querySelectorAll(".imageRow").forEach((element) => { element.remove(); });

    customBonks[customName].impactDecals.forEach((_, index) =>
    {
        if (fs.existsSync(__dirname + "/" + customBonks[customName].impactDecals[index].location))
        {
            var row = document.querySelector("#impactDecalRow").cloneNode(true);
            row.removeAttribute("id");
            row.classList.add("imageRow");
            row.removeAttribute("hidden");
            row.querySelector(".imageLabel").innerText = customBonks[customName].impactDecals[index].location.substr(customBonks[customName].impactDecals[index].location.lastIndexOf('/') + 1);
            document.querySelector("#impactDecalsTable").appendChild(row);

            row.querySelector(".imageImage").src = customBonks[customName].impactDecals[index].location;

            row.querySelector(".imageRemove").addEventListener("click", () => {
                customBonks[customName].impactDecals.splice(index, 1);
                setData("customBonks", customBonks);
                openImpactDecals(customName);
            });

            row.querySelector(".imageEnabled").checked = customBonks[customName].impactDecals[index].enabled;
            row.querySelector(".imageEnabled").addEventListener("change", () => {
                customBonks[customName].impactDecals[index].enabled = row.querySelector(".imageEnabled").checked;
                setData("customBonks", customBonks);

                var allEnabled = true;
                for (var i = 0; i < customBonks[customName].impactDecals.length; i++)
                {
                    if (!customBonks[customName].impactDecals[i].enabled)
                    {
                        allEnabled = false;
                        break;
                    }
                }
                document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked = allEnabled;
            });

            row.querySelector(".decalDuration").value = customBonks[customName].impactDecals[index].duration;
            row.querySelector(".decalDuration").addEventListener("change", () => {
                clampValue(row.querySelector(".decalDuration").value, 0, null);
                customBonks[customName].impactDecals[index].duration = parseFloat(row.querySelector(".decalDuration").value);
                setData("customBonks", customBonks);
            });

            row.querySelector(".decalScale").value = customBonks[customName].impactDecals[index].scale;
            row.querySelector(".decalScale").addEventListener("change", () => {
                clampValue(row.querySelector(".decalScale"), 0, null);
                customBonks[customName].impactDecals[index].scale = parseFloat(row.querySelector(".decalScale").value);
                setData("customBonks", customBonks);
            });
        }
        else
        {
            customBonks[customName].impactDecals.splice(index, 1);
            setData("customBonks", customBonks);
        }
    });
}

async function loadWindupSound(customName)
{
    var customBonks = await getData("customBonks");
    var files = document.querySelector("#loadWindupSound").files;
    for (var i = 0; i < files.length; i++)
    {
        var soundFile = files[i];
        if (!fs.existsSync(__dirname + "/windups/"))
            fs.mkdirSync(__dirname + "/windups/");

        var append = "";
        if (soundFile.path != __dirname + "\\windups\\" + soundFile.name)
            while (fs.existsSync(__dirname + "/windups/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, __dirname + "/windups/" + filename);

        customBonks[customName].windupSounds.unshift({
            "location": "windups/" + filename,
            "volume": 1.0,
            "enabled": true
        });
    }
    setData("customBonks", customBonks);
    openWindupSounds(customName);
    
    document.querySelector("#loadWindupSound").value = null;
}

async function openWindupSounds(customName)
{
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#windupSoundTable");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newWindupSound").addEventListener("click", () => { document.querySelector("#loadWindupSound").click(); });
    document.querySelector("#loadWindupSound").addEventListener("change", () => { loadWindupSound(customName) });

    var customBonks = await getData("customBonks");

    var allEnabled = true;
    for (var i = 0; i < customBonks[customName].windupSounds.length; i++)
    {
        if (!customBonks[customName].windupSounds[i].enabled)
        {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#windupSoundTable").querySelector(".selectAll input").addEventListener("change", async () => {
        document.querySelector("#windupSoundTable").querySelectorAll(".imageEnabled").forEach((element) => { 
            element.checked = document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < customBonks[customName].windupSounds.length; i++)
            customBonks[customName].windupSounds[i].enabled = document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked;
        setData("customBonks", customBonks);
    });
    
    document.querySelector("#windupSoundTable").querySelectorAll(".soundRow").forEach((element) => { element.remove(); });

    customBonks[customName].windupSounds.forEach((_, index) =>
    {
        if (fs.existsSync(__dirname + "/" + customBonks[customName].windupSounds[index].location))
        {
            var row = document.querySelector("#windupSoundRow").cloneNode(true);
            row.removeAttribute("id");
            row.classList.add("soundRow");
            row.removeAttribute("hidden");
            row.querySelector(".imageLabel").innerText = customBonks[customName].windupSounds[index].location.substr(customBonks[customName].windupSounds[index].location.lastIndexOf('/') + 1);
            document.querySelector("#windupSoundTable").appendChild(row);

            row.querySelector(".imageRemove").addEventListener("click", () => {
                customBonks[customName].windupSounds.splice(index, 1);
                setData("customBonks", customBonks);
                openWindupSounds(customName);
            });

            row.querySelector(".imageEnabled").checked = customBonks[customName].windupSounds[index].enabled;
            row.querySelector(".imageEnabled").addEventListener("change", () => {
                customBonks[customName].windupSounds[index].enabled = row.querySelector(".imageEnabled").checked;
                setData("customBonks", customBonks);

                var allEnabled = true;
                for (var i = 0; i < customBonks[customName].windupSounds.length; i++)
                {
                    if (!customBonks[customName].windupSounds[i].enabled)
                    {
                        allEnabled = false;
                        break;
                    }
                }
                document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked = allEnabled;
            });

            row.querySelector(".soundVolume").value = customBonks[customName].windupSounds[index].volume;
            row.querySelector(".soundVolume").addEventListener("change", () => {
                clampValue(row.querySelector(".soundVolume"), 0, 1);
                customBonks[customName].windupSounds[index].volume = parseFloat(row.querySelector(".soundVolume").value);
                setData("customBonks", customBonks);
            });
        }
        else
        {
            customBonks[customName].windupSounds.splice(index, 1);
            setData("customBonks", customBonks);
        }
    });
}

document.querySelector("#loadImageSound").addEventListener("change", loadImageSound);

async function loadImageSound()
{
    // Grab the image that was just loaded
    var soundFile = document.querySelector("#loadImageSound").files[0];
    // If the folder for objects doesn"t exist for some reason, make it
    if (!fs.existsSync(__dirname + "/impacts/"))
        fs.mkdirSync(__dirname + "/impacts/");

    // Ensure that we"re not overwriting any existing files with the same name
    // If a file already exists, add an interating number to the end until it"s a unique filename
    var append = "";
    if (soundFile.path != __dirname + "\\impacts\\" + soundFile.name)
        while (fs.existsSync( __dirname + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
            append = append == "" ? 2 : (append + 1);
    var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

    // Make a copy of the file into the local folder
    fs.copyFileSync(soundFile.path, __dirname + "/impacts/" + filename);
    
    // Get the existing images, add the new image, update the data, and refresh the images page
    var throws = await getData("throws");
    throws[currentImageIndex].sound = "impacts/" + filename;
    setData("throws", throws);
    
    // Reset the image upload
    document.querySelector("#loadImageSound").value = null;
    openImageDetails(currentImageIndex);
}

var currentImageIndex = -1;
async function openImageDetails()
{
    var throws = await getData("throws");

    // Refresh nodes to remove old listeners
    var oldButton = document.querySelector("#testImage");
    var newButton = document.querySelector("#testImage").cloneNode(true);
    oldButton.after(newButton);
    oldButton.remove();

    var oldTable = document.querySelector("#testImage");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#testImage").addEventListener("click", () => testItem(currentImageIndex));

    const details = document.querySelector("#imageDetails");

    details.querySelector(".imageLabel").innerText = throws[currentImageIndex].location.substr(throws[currentImageIndex].location.lastIndexOf('/') + 1);

    details.querySelector(".imageImage").src = throws[currentImageIndex].location;
    details.querySelector(".imageImage").style.transform = "scale(" + throws[currentImageIndex].scale + ")";
    details.querySelector(".imageWeight").value = throws[currentImageIndex].weight;
    details.querySelector(".imageScale").value = throws[currentImageIndex].scale;
    if (throws[currentImageIndex].sound != null)
    {
        details.querySelector(".imageSoundName").value = throws[currentImageIndex].sound.substr(8);
        details.querySelector(".imageSoundRemove").removeAttribute("disabled");
    }
    else
    {
        details.querySelector(".imageSoundName").value = null;
        details.querySelector(".imageSoundRemove").disabled = "disabled";
    }

    details.querySelector(".imageWeight").addEventListener("change", () => {
        throws[currentImageIndex].weight = parseFloat(details.querySelector(".imageWeight").value);
        setData("throws", throws);
    });

    details.querySelector(".imageScale").addEventListener("change", () => {
        throws[currentImageIndex].scale = parseFloat(details.querySelector(".imageScale").value);
        details.querySelector(".imageImage").style.transform = "scale(" + throws[currentImageIndex].scale + ")";
        setData("throws", throws);
    });

    details.querySelector(".imageSoundVolume").value = throws[currentImageIndex].volume;
    details.querySelector(".imageSoundVolume").addEventListener("change", () => {
        throws[currentImageIndex].volume = parseFloat(details.querySelector(".imageSoundVolume").value);
        setData("throws", throws);
    });

    details.querySelector(".imageSoundRemove").addEventListener("click", () => {
        throws[currentImageIndex].sound = null;
        setData("throws", throws);
        details.querySelector(".imageSoundName").value = null;
        details.querySelector(".imageSoundRemove").disabled = "disabled";
    });

}

document.querySelector("#newSound").addEventListener("click", () => { document.querySelector("#loadSound").click(); });
document.querySelector("#loadSound").addEventListener("change", loadSound);

async function loadSound()
{
    var impacts = await getData("impacts");
    var files = document.querySelector("#loadSound").files;
    for (var i = 0; i < files.length; i++)
    {
        var soundFile = files[i];
        if (!fs.existsSync(__dirname + "/impacts/"))
            fs.mkdirSync(__dirname + "/impacts/");

        var append = "";
        if (soundFile.path != __dirname + "\\impacts\\" + soundFile.name)
            while (fs.existsSync( __dirname + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, __dirname + "/impacts/" + filename);

        impacts.unshift({
            "location": "impacts/" + filename,
            "volume": 1.0,
            "enabled": true,
            "customs": []
        });
    }
    setData("impacts", impacts);
    openSounds();
    
    document.querySelector("#loadSound").value = null;
}

document.querySelector("#soundTable").querySelector(".selectAll input").addEventListener("change", async () => {
    document.querySelector("#soundTable").querySelectorAll(".imageEnabled").forEach((element) => { 
        element.checked = document.querySelector("#soundTable").querySelector(".selectAll input").checked;
    });
    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
        impacts[i].enabled = document.querySelector("#soundTable").querySelector(".selectAll input").checked;
    setData("impacts", impacts);
});

async function openSounds()
{
    var impacts = await getData("impacts");
    
    document.querySelector("#soundTable").querySelectorAll(".soundRow").forEach((element) => { element.remove(); });

    if (impacts == null)
        setData("impacts", []);
    else
    {
        impacts.forEach((_, index) =>
        {
            if (fs.existsSync(__dirname + "/" + impacts[index].location))
            {
                var row = document.querySelector("#soundRow").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("soundRow");
                row.removeAttribute("hidden");
                row.querySelector(".imageLabel").innerText = impacts[index].location.substr(impacts[index].location.lastIndexOf('/') + 1);
                document.querySelector("#soundTable").appendChild(row);

                row.querySelector(".imageRemove").addEventListener("click", () => {
                    impacts.splice(index, 1);
                    setData("impacts", impacts);
                    openSounds();
                });

                row.querySelector(".imageEnabled").checked = impacts[index].enabled;
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    impacts[index].enabled = row.querySelector(".imageEnabled").checked;
                    setData("impacts", impacts);

                    var allEnabled = true;
                    for (var i = 0; i < impacts.length; i++)
                    {
                        if (!impacts[i].enabled)
                        {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#soundTable").querySelector(".selectAll input").checked = allEnabled;
                });

                row.querySelector(".soundVolume").value = impacts[index].volume;
                row.querySelector(".soundVolume").addEventListener("change", () => {
                    clampValue(row.querySelector(".soundVolume"), 0, 1);
                    impacts[index].volume = parseFloat(row.querySelector(".soundVolume").value);
                    setData("impacts", impacts);
                });
            }
            else
            {
                impacts.splice(index, 1);
                setData("impacts", impacts);
            }
        });
    }
}



document.querySelector("#bonksAdd").addEventListener("click", addBonk);

async function addBonk()
{
    var newBonkNumber = 1;
    var customBonks = await getData("customBonks");
    if (customBonks == null)
        customBonks = {};
    
    while (customBonks["Custom Bonk " + newBonkNumber] != null)
        newBonkNumber++;

    customBonks["Custom Bonk " + newBonkNumber] = {
        "barrageCount": 1,
        "barrageFrequencyOverride": false,
        "barrageFrequency": await getData("barrageFrequency"),
        "throwDurationOverride": false,
        "throwDuration": await getData("throwDuration"),
        "throwAngleOverride": false,
        "throwAngleMin": await getData("throwAngleMin"),
        "throwAngleMax": await getData("throwAngleMax"),
        "spinSpeedMin": await getData("spinSpeedMin"),
        "spinSpeedMax": await getData("spinSpeedMax"),
        "itemsOverride": false,
        "soundsOverride": false,
        "impactDecals": [],
        "windupSounds": [],
        "windupDelay": 0,
        "throwAway": false
    };

    setData("customBonks", customBonks);

    var throws = await getData("throws");
    for (var i = 0; i < throws.length; i++)
        if (throws[i].enabled)
            throws[i].customs.push("Custom Bonk " + newBonkNumber);
    setData("throws", throws);

    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
        if (impacts[i].enabled)
            impacts[i].customs.push("Custom Bonk " + newBonkNumber);
    setData("impacts", impacts);
    
    openBonks();
}

async function bonkDetails(customBonkName)
{
    var customBonks = await getData("customBonks");

    if (customBonks[customBonkName] != null)
    {
        showPanel("bonkDetails", true);

        // Copy new elements to remove all old listeners
        var oldTable = document.querySelector("#bonkDetailsTable");
        var newTable = oldTable.cloneNode(true);
        oldTable.after(newTable);
        oldTable.remove();

        const bonkDetailsTable = document.querySelector("#bonkDetailsTable");

        // Bonk Name
        bonkDetailsTable.querySelector(".bonkName").value = customBonkName;
        bonkDetailsTable.querySelector(".bonkName").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            if (customBonks[bonkDetailsTable.querySelector(".bonkName").value] == null)
            {
                customBonks[bonkDetailsTable.querySelector(".bonkName").value] = customBonks[customBonkName];
                delete customBonks[customBonkName];

                var throws = await getData("throws");
                for (var i = 0; i < throws.length; i++)
                {
                    if (throws[i].customs.includes(customBonkName))
                    {
                        throws[i].customs.splice(throws[i].customs.indexOf(customBonkName), 1);
                        throws[i].customs.push(bonkDetailsTable.querySelector(".bonkName").value);
                    }
                }
                setData("throws", throws);

                var impacts = await getData("impacts");
                for (var i = 0; i < impacts.length; i++)
                {
                    if (impacts[i].customs.includes(customBonkName))
                    {
                        impacts[i].customs.splice(impacts[i].customs.indexOf(customBonkName), 1);
                        impacts[i].customs.push(bonkDetailsTable.querySelector(".bonkName").value);
                    }
                }
                setData("impacts", impacts);

                customBonkName = bonkDetailsTable.querySelector(".bonkName").value;
            }
            else
            {
                // Error: Name exists
            }
            setData("customBonks", customBonks);
        });

        // Barrage Count
        bonkDetailsTable.querySelector(".barrageCount").value = customBonks[customBonkName].barrageCount;
        bonkDetailsTable.querySelector(".barrageCount").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageCount = parseInt(bonkDetailsTable.querySelector(".barrageCount").value);
            setData("customBonks", customBonks);
        });

        //Throw Away Instead
        bonkDetailsTable.querySelector(".throwAway").checked = customBonks[customBonkName].throwAway;
        bonkDetailsTable.querySelector(".throwAway").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAway = bonkDetailsTable.querySelector(".throwAway").checked;
            setData("customBonks", customBonks);
        });

        // Barrage Frequency
        bonkDetailsTable.querySelector(".barrageFrequencyOverride").checked = customBonks[customBonkName].barrageFrequencyOverride;
        bonkDetailsTable.querySelector(".barrageFrequency").disabled = !customBonks[customBonkName].barrageFrequencyOverride;
        bonkDetailsTable.querySelector(".barrageFrequencyOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageFrequencyOverride = bonkDetailsTable.querySelector(".barrageFrequencyOverride").checked;
            bonkDetailsTable.querySelector(".barrageFrequency").disabled = !customBonks[customBonkName].barrageFrequencyOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".barrageFrequency").value = customBonks[customBonkName].barrageFrequency;
        bonkDetailsTable.querySelector(".barrageFrequency").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageFrequency = parseFloat(bonkDetailsTable.querySelector(".barrageFrequency").value);
            setData("customBonks", customBonks);
        });

        // Throw Duration
        bonkDetailsTable.querySelector(".throwDurationOverride").checked = customBonks[customBonkName].throwDurationOverride;
        bonkDetailsTable.querySelector(".throwDuration").disabled = !customBonks[customBonkName].throwDurationOverride;
        bonkDetailsTable.querySelector(".throwDurationOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwDurationOverride = bonkDetailsTable.querySelector(".throwDurationOverride").checked;
            bonkDetailsTable.querySelector(".throwDuration").disabled = !customBonks[customBonkName].throwDurationOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".throwDuration").value = customBonks[customBonkName].throwDuration;
        bonkDetailsTable.querySelector(".throwDuration").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwDuration = parseFloat(bonkDetailsTable.querySelector(".throwDuration").value);
            setData("customBonks", customBonks);
        });

        // Spin Speed
        bonkDetailsTable.querySelector(".spinSpeedOverride").checked = customBonks[customBonkName].spinSpeedOverride;
        bonkDetailsTable.querySelector(".spinSpeedMin").disabled = !customBonks[customBonkName].spinSpeedOverride;
        bonkDetailsTable.querySelector(".spinSpeedMax").disabled = !customBonks[customBonkName].spinSpeedOverride;
        bonkDetailsTable.querySelector(".spinSpeedOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].spinSpeedOverride = bonkDetailsTable.querySelector(".spinSpeedOverride").checked;
            bonkDetailsTable.querySelector(".spinSpeedMin").disabled = !customBonks[customBonkName].spinSpeedOverride;
            bonkDetailsTable.querySelector(".spinSpeedMax").disabled = !customBonks[customBonkName].spinSpeedOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".spinSpeedMin").value = customBonks[customBonkName].spinSpeedMin;
        bonkDetailsTable.querySelector(".spinSpeedMin").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].spinSpeedMin = parseFloat(bonkDetailsTable.querySelector(".spinSpeedMin").value);
            setData("customBonks", customBonks);
        });

        // Throw Angle Max
        bonkDetailsTable.querySelector(".spinSpeedMax").value = customBonks[customBonkName].spinSpeedMax;
        bonkDetailsTable.querySelector(".spinSpeedMax").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].spinSpeedMax = parseFloat(bonkDetailsTable.querySelector(".spinSpeedMax").value);
            setData("customBonks", customBonks);
        });

        // Throw Angle
        bonkDetailsTable.querySelector(".throwAngleOverride").checked = customBonks[customBonkName].throwAngleOverride;
        bonkDetailsTable.querySelector(".throwAngleMin").disabled = !customBonks[customBonkName].throwAngleOverride;
        bonkDetailsTable.querySelector(".throwAngleMax").disabled = !customBonks[customBonkName].throwAngleOverride;
        bonkDetailsTable.querySelector(".throwAngleOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAngleOverride = bonkDetailsTable.querySelector(".throwAngleOverride").checked;
            bonkDetailsTable.querySelector(".throwAngleMin").disabled = !customBonks[customBonkName].throwAngleOverride;
            bonkDetailsTable.querySelector(".throwAngleMax").disabled = !customBonks[customBonkName].throwAngleOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".throwAngleMin").value = customBonks[customBonkName].throwAngleMin;
        bonkDetailsTable.querySelector(".throwAngleMin").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAngleMin = parseInt(bonkDetailsTable.querySelector(".throwAngleMin").value);
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".throwAngleMax").value = customBonks[customBonkName].throwAngleMax;
        bonkDetailsTable.querySelector(".throwAngleMax").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAngleMax = parseInt(bonkDetailsTable.querySelector(".throwAngleMax").value);
            setData("customBonks", customBonks);
        });

        // Items
        bonkDetailsTable.querySelector(".imagesOverride").checked = customBonks[customBonkName].itemsOverride;
        bonkDetailsTable.querySelector(".images").disabled = !customBonks[customBonkName].itemsOverride;
        bonkDetailsTable.querySelector(".imagesOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].itemsOverride = bonkDetailsTable.querySelector(".imagesOverride").checked;
            bonkDetailsTable.querySelector(".images").disabled = !customBonks[customBonkName].itemsOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".images").addEventListener("click", () => {
            if (!bonkDetailsTable.querySelector(".images").disabled)
            {
                openImagesCustom(customBonkName);
                showPanel("bonkImagesCustom", true);
            }
        });

        // Sounds
        bonkDetailsTable.querySelector(".soundsOverride").checked = customBonks[customBonkName].soundsOverride;
        bonkDetailsTable.querySelector(".sounds").disabled = !customBonks[customBonkName].soundsOverride;
        bonkDetailsTable.querySelector(".soundsOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].soundsOverride = bonkDetailsTable.querySelector(".soundsOverride").checked;
            bonkDetailsTable.querySelector(".sounds").disabled = !customBonks[customBonkName].soundsOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".sounds").addEventListener("click", () => {
            if (!bonkDetailsTable.querySelector(".sounds").disabled)
            {
                openSoundsCustom(customBonkName);
                showPanel("bonkSoundsCustom", true);
            }
        });

        // Impact Decals
        bonkDetailsTable.querySelector(".impactDecals").addEventListener("click", () => {
            openImpactDecals(customBonkName);
            showPanel("impactDecals", true);
        });

        // Windup Sounds
        bonkDetailsTable.querySelector(".windupSounds").addEventListener("click", () => {
            openWindupSounds(customBonkName);
            showPanel("windupSounds", true);
        });

        // Windup Delay
        bonkDetailsTable.querySelector(".windupDelay").value = customBonks[customBonkName].windupDelay;
        bonkDetailsTable.querySelector(".windupDelay").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].windupDelay = parseFloat(bonkDetailsTable.querySelector(".windupDelay").value);
            setData("customBonks", customBonks);
        });
    }
}

async function openBonks()
{
    var customBonks = await getData("customBonks");

    document.querySelectorAll(".customBonkRow").forEach(element => { element.remove(); });

    if (customBonks == null)
        setData("customBonks", {});
    else
    {
        for (const key in customBonks)
        {
            const row = document.querySelector("#customBonkRow").cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");
            row.classList.add("customBonkRow");
            document.querySelector("#bonksTable").appendChild(row);

            row.querySelector(".bonkDetailsButton").addEventListener("click", () => {
                bonkDetails(key);
            });

            row.querySelector(".imageLabel").innerText = key;

            row.querySelector(".imageRemove").addEventListener("click", async () => {
                delete customBonks[key];
                setData("customBonks", customBonks);

                var throws = await getData("throws");
                for (var i = 0; i < throws.length; i++)
                {
                    if (throws[i].customs.includes(key))
                        throws[i].customs.splice(throws[i].customs.indexOf(key), 1);
                }
                setData("throws", throws);

                var impacts = await getData("impacts");
                for (var i = 0; i < impacts.length; i++)
                {
                    if (impacts[i].customs.includes(key))
                        impacts[i].customs.splice(impacts[i].customs.indexOf(key), 1);
                }

                setData("impacts", impacts);

                var eventType = await getData("redeems");
                for (var i = 0; i < eventType.length; i++)
                {
                    if (eventType[i].bonkType == key)
                        eventType[i].bonkType = "single";
                }
                setData("redeems", eventType);

                eventType = await getData("commands");
                for (var i = 0; i < eventType.length; i++)
                {
                    if (eventType[i].bonkType == key)
                        eventType[i].bonkType = "single";
                }
                setData("commands", eventType);

                eventType = await getData("subType");
                if (eventType == key)
                    setData("subType", "barrage");

                eventType = await getData("subGiftType");
                if (eventType == key)
                    setData("subGiftType", "barrage");

                openBonks();
            });
        };
    }
}

async function openTestBonks()
{
    var customBonks = await getData("customBonks");

    document.querySelectorAll(".testCustom").forEach(element => { element.remove(); });

    if (customBonks == null)
        setData("customBonks", {});
    else
    {
        for (const key in customBonks)
        {
            const row = document.querySelector("#testCustom").cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");
            row.classList.add("testCustom");
            document.querySelector("#testCustom").after(row);

            row.querySelector(".innerTopButton").innerText = key;

            row.addEventListener("click", () => testCustomBonk(key));
        };
    }
}

document.querySelector("#eventsAdd").addEventListener("click", newEvent);

// Create a new redeem event
async function newEvent()
{
    console.log("New Event creator triggered!");
    var newEventNumber = 1;
    var events = await getData("crowdControlEvents");
    if (events == null)
        events = {};

    while (events["CC Event " + newEventNumber] != null)
        newEventNumber++;

    events["CC Event " + newEventNumber] = {
        "enabled": true,
        "name": null,
        "triggerName": null,
        "crowdControlGame": 9,
        "crowdControlEffect": 1,
        "triggerType": null,
        "bonkEnabled": false,
        "bonkType": "single",
        "hotkeyEnabled": false,
        "hotkeyName": null,
        "secondHotkeyEnabled": false,
        "secondHotkeyName": null,
        "secondHotkeyDelay": 2500,
        "expressionEnabled": false,
        "expressionName": null,
        "expressionDuration": 1000,
    };

    setData("crowdControlEvents", events);
    openEvents();
}

async function eventDetails(eventName)
{
    console.log("Events details triggered!");
    var customBonks = await getData("customBonks");
    var events = await getData("crowdControlEvents");

    if (events[eventName] != null)
    {
        showPanel("eventDetails", true);

        // Copy new elements to remove all old listeners
        var oldTable = document.querySelector("#eventDetailsTable");
        var newTable = oldTable.cloneNode(true);
        oldTable.after(newTable);
        oldTable.remove();

        const eventDetailsTable = document.querySelector("#eventDetailsTable");

        // Event Name
        eventDetailsTable.querySelector(".eventName").value = eventName;
        eventDetailsTable.querySelector(".eventName").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            if (events[eventDetailsTable.querySelector(".eventName").value] == null)
            {
                events[eventDetailsTable.querySelector(".eventName").value] = events[eventName];
                delete events[eventName];

                eventName = eventDetailsTable.querySelector(".eventName").value;
            }
            else
            {
                // Error: Name exists
            }
            setData("crowdControlEvents", events);
        });

        //Enabled
        eventDetailsTable.querySelector(".eventEnabled").checked = events[eventName].enabled;
        eventDetailsTable.querySelector(".eventEnabled").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].enabled = eventDetailsTable.querySelector(".eventEnabled").checked;
            setData("crowdControlEvents", events);
        });

        //CC Game and effect

        var ccGameBox = eventDetailsTable.querySelector(".crowdControlGame");

        while (ccGameBox.options.length > 0) {
            ccGameBox.remove(0);
        }
        crowdControlGames.forEach(gameEntry => {
           ccGameBox.add(new Option(gameEntry.name, gameEntry.menuID));
        });
        ccGameBox.value = events[eventName].crowdControlGame;
        eventDetailsTable.querySelector(".crowdControlGame").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].crowdControlGame = eventDetailsTable.querySelector(".crowdControlGame").value;
            setData("crowdControlEvents", events);
            await getCrowdControlGame(events[eventName].crowdControlGame, events[eventName].crowdControlEffect);
        });

        if(events[eventName].crowdControlEffect) {
            await getCrowdControlGame(events[eventName].crowdControlGame, events[eventName].crowdControlEffect);
        }

        eventDetailsTable.querySelector(".crowdControlEffect").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].crowdControlEffect = eventDetailsTable.querySelector(".crowdControlEffect").value;
            setData("crowdControlEvents", events);
            await getCrowdControlEffect(events[eventName].crowdControlGame, events[eventName].crowdControlEffect);
        });

        //CC Effect

        //CC Event Name
        eventDetailsTable.querySelector(".triggerName").value = events[eventName].triggerName;
        eventDetailsTable.querySelector(".triggerName").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].triggerName = eventDetailsTable.querySelector(".triggerName").value;
            setData("crowdControlEvents", events);
        });

        //CC Event Type
        eventDetailsTable.querySelector(".triggerType").value = events[eventName].triggerType;
        eventDetailsTable.querySelector(".triggerType").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].triggerType = eventDetailsTable.querySelector(".triggerType").value;
            setData("crowdControlEvents", events);
        });

        //Bonk
        eventDetailsTable.querySelector(".bonkEnabled").checked = events[eventName].bonkEnabled;
        eventDetailsTable.querySelector(".bonkType").disabled = !events[eventName].bonkEnabled;
        eventDetailsTable.querySelector(".bonkEnabled").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].bonkEnabled = eventDetailsTable.querySelector(".bonkEnabled").checked;
            eventDetailsTable.querySelector(".bonkType").disabled = !events[eventName].bonkEnabled;
            setData("crowdControlEvents", events);
        });

        eventDetailsTable.querySelector(".bonkType").value = events[eventName].bonkType;
        eventDetailsTable.querySelector(".bonkType").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].bonkType = eventDetailsTable.querySelector(".bonkType").value;
            setData("crowdControlEvents", events);
        });

        //Hotkey
        eventDetailsTable.querySelector(".hotkeyEnabled").checked = events[eventName].hotkeyEnabled;
        eventDetailsTable.querySelector(".hotkeyName").disabled = !events[eventName].hotkeyEnabled;
        eventDetailsTable.querySelector(".hotkeyEnabled").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].hotkeyEnabled = eventDetailsTable.querySelector(".hotkeyEnabled").checked;
            eventDetailsTable.querySelector(".hotkeyName").disabled = !events[eventName].hotkeyEnabled;
            setData("crowdControlEvents", events);
        });

        eventDetailsTable.querySelector(".hotkeyName").value = events[eventName].hotkeyName;
        eventDetailsTable.querySelector(".hotkeyName").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].hotkeyName = eventDetailsTable.querySelector(".hotkeyName").value;
            setData("crowdControlEvents", events);
        });

        //Second Hotkey
        eventDetailsTable.querySelector(".secondHotkeyEnabled").checked = events[eventName].secondHotkeyEnabled;
        eventDetailsTable.querySelector(".secondHotkeyName").disabled = !events[eventName].secondHotkeyEnabled;
        eventDetailsTable.querySelector(".secondHotkeyDelay").disabled = !events[eventName].secondHotkeyEnabled;
        eventDetailsTable.querySelector(".secondHotkeyEnabled").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].secondHotkeyEnabled = eventDetailsTable.querySelector(".secondHotkeyEnabled").checked;
            eventDetailsTable.querySelector(".secondHotkeyName").disabled = !events[eventName].secondHotkeyEnabled;
            eventDetailsTable.querySelector(".secondHotkeyDelay").disabled = !events[eventName].secondHotkeyEnabled;
            setData("crowdControlEvents", events);
        });

        eventDetailsTable.querySelector(".secondHotkeyName").value = events[eventName].secondHotkeyName;
        eventDetailsTable.querySelector(".secondHotkeyName").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].secondHotkeyName = eventDetailsTable.querySelector(".secondHotkeyName").value;
            setData("crowdControlEvents", events);
        });

        eventDetailsTable.querySelector(".secondHotkeyDelay").value = events[eventName].secondHotkeyDelay;
        eventDetailsTable.querySelector(".secondHotkeyDelay").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].secondHotkeyDelay = parseInt(eventDetailsTable.querySelector(".secondHotkeyDelay").value);
            setData("crowdControlEvents", events);
        });

        //Expression
        eventDetailsTable.querySelector(".expressionEnabled").checked = events[eventName].expressionEnabled;
        eventDetailsTable.querySelector(".expressionName").disabled = !events[eventName].expressionEnabled;
        eventDetailsTable.querySelector(".expressionDuration").disabled = !events[eventName].expressionEnabled;
        eventDetailsTable.querySelector(".expressionEnabled").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].expressionEnabled = eventDetailsTable.querySelector(".expressionEnabled").checked;
            eventDetailsTable.querySelector(".expressionName").disabled = !events[eventName].expressionEnabled;
            eventDetailsTable.querySelector(".expressionDuration").disabled = !events[eventName].expressionEnabled;
            setData("crowdControlEvents", events);
        });

        eventDetailsTable.querySelector(".expressionName").value = events[eventName].expressionName;
        eventDetailsTable.querySelector(".expressionName").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].expressionName = eventDetailsTable.querySelector(".expressionName").value;
            setData("crowdControlEvents", events);
        });

        eventDetailsTable.querySelector(".expressionDuration").value = events[eventName].expressionDuration;
        eventDetailsTable.querySelector(".expressionDuration").addEventListener("change", async () => {
            events = await getData("crowdControlEvents");
            events[eventName].expressionDuration = parseInt(eventDetailsTable.querySelector(".expressionDuration").value);
            setData("crowdControlEvents", events);
        });

    }
}

async function openEvents()
{
    var events = await getData("crowdControlEvents");
    console.log("Events tab opened!");

    document.querySelectorAll(".ccEventRow").forEach(element => { element.remove(); });

    if (events == null)
        setData("crowdControlEvents", {});
    else
    {
        for (const key in events)
        {
            const row = document.querySelector("#ccEventRow").cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");
            row.classList.add("ccEventRow");
            document.querySelector("#eventsTable").appendChild(row);

            row.querySelector(".eventDetailsButton").addEventListener("click", () => {
                eventDetails(key);
            });

            row.querySelector(".imageLabel").innerText = key;

            row.querySelector(".imageRemove").addEventListener("click", async () => {
                delete events[key];
                setData("crowdControlEvents", events);

                openEvents();
            });
        }
    }
}

// ----
// Data
// ----

const defaultData = JSON.parse(fs.readFileSync(__dirname + "/defaultData.json", "utf8"));

// Counter for number of writes that are being attempted
// Will only attempt to load data if not currently writing
// Inter-process communication means this is necessary
var isWriting = 0;
ipcRenderer.on("doneWriting", () => {
    if (--isWriting < 0)
        isWriting = 0;
});

// Get requested data, waiting for any current writes to finish first
async function getData(field)
{
    while (isWriting > 0)
        await new Promise(resolve => setTimeout(resolve, 10));

    if (!fs.existsSync(__dirname + "/data.json"))
        fs.writeFileSync(__dirname + "/data.json", JSON.stringify(defaultData));

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

// Send new data to the main process to write to file
function setData(field, value)
{
    isWriting++;
    ipcRenderer.send("setData", [ field, value ]);
    
    if (field == "portThrower" || field == "portVTubeStudio")
        setPorts();
}

// If ports change, write them to the file read by the Browser Source file
async function setPorts()
{
    fs.writeFileSync(__dirname + "/ports.js", "const ports = [ " + await getData("portThrower") + ", " + await getData("portVTubeStudio") + " ];");
}

// Load the requested data and apply it to the relevant settings field
async function loadData(field)
{
    const thisData = await getData(field);
    if (thisData != null)
    {
        if (document.querySelector("#" + field).type == "checkbox")
            document.querySelector("#" + field).checked = thisData;
        else
        {
            document.querySelector("#" + field).value = thisData;
            if (field == "portThrower" || field == "portVTubeStudio")
                setPorts();
        }
    }
    else
    {
        const node = document.querySelector("#" + field);
        const val = node.type == "checkbox" ? node.checked : (node.type == "number" ? parseFloat(node.value) : node.value);
        setData(field, val);
    }
}

var crowdControlGames = {};

function getCrowdControlGames() {
    axios.get("https://api.crowdcontrol.live/available_games")
        .then((response) => {
            crowdControlGames = response.data;
        })
        .catch(function (e) {
            console.log(e);
        });
}

async function getCrowdControlGame(game_id,value) {
    const eventDetailsTable = document.querySelector("#eventDetailsTable");
    var ccEffectBox = eventDetailsTable.querySelector(".crowdControlEffect");
    var ccEffectList = [];
    while (ccEffectBox.options.length > 0) {
        ccEffectBox.remove(0);
    }
    console.log("Checking " + "https://api.crowdcontrol.live/menu/"+game_id);
    axios.get("https://api.crowdcontrol.live/menu/"+game_id).then(response => {
        ccEffectList = response.data.menu.items;
        ccEffectList.forEach(effectEntry => {
            ccEffectBox.add(new Option(effectEntry.name, effectEntry.bid));
        });
        ccEffectBox.value = value;
        return true;
    }).catch(e => {console.log(e); return null; });
}

async function getCrowdControlEffect(game_id, value) {
    const eventDetailsTable = document.querySelector("#eventDetailsTable");
    var ccEffectList = [];
    console.log("Checking " + "https://api.crowdcontrol.live/menu/"+game_id);
    axios.get("https://api.crowdcontrol.live/menu/"+game_id).then(response => {
        ccEffectList = response.data.menu.items;
        ccEffectList.forEach(effectEntry => {
            if(effectEntry.bid == value) {
                eventDetailsTable.querySelector(".triggerName").value = effectEntry.safeName;
                eventDetailsTable.querySelector(".triggerName").dispatchEvent(new Event("change"));
            }
        });
        return true;
    }).catch(e => {console.log(e); return null; });

}

// Place all settings from data into the proper location on load
window.onload = async function()
{
    // UPDATING FROM 1.0.1 OR EARLIER
    var throws = await getData("throws");
    for (var i = 0; i < throws.length; i++)
    {
        if (Array.isArray(throws[i]))
        {
            throws[i] = {
                "location": throws[i][0],
                "weight": throws[i][1],
                "scale": throws[i][2],
                "sound": throws[i][3],
                "volume": throws[i][4] == null ? 1 : throws[i][4],
                "enabled": true,
                "customs": []
            };
        }
    }
    setData("throws", throws);

    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
    {
        if (Array.isArray(impacts[i]))
        {
            impacts[i] = {
                "location": impacts[i][0],
                "volume": impacts[i][1],
                "enabled": true,
                "customs": []
            };
        }
    }
    setData("impacts", impacts);

    // UPDATE 1.12
    var customBonks = await getData("customBonks");
    if (customBonks != null)
    {
        for (const key in customBonks)
        {
            if (customBonks[key].spinSpeedOverride == null)
                customBonks[key].spinSpeedOverride = false;
            if (customBonks[key].spinSpeedMin == null)
                customBonks[key].spinSpeedMin = 5;
            if (customBonks[key].spinSpeedMax == null)
                customBonks[key].spinSpeedMax = 10;
        }

        setData("customBonks", customBonks);
    }

    // UPDATE 1.13
    var tray = await getData("minimizeToTray");
    if (tray == null)
        setData("minimizeToTray", false);

    // END UPDATING

    getCrowdControlGames();

    loadData("barrageCount");
    loadData("barrageFrequency");
    loadData("throwDuration");
    loadData("returnSpeed");
    loadData("throwAngleMin");
    loadData("throwAngleMax");
    loadData("spinSpeedMin");
    loadData("spinSpeedMax");
    loadData("closeEyes");
    loadData("openEyes");
    loadData("itemScaleMin");
    loadData("itemScaleMax");
    loadData("delay");
    loadData("volume");
    loadData("portThrower");
    loadData("portVTubeStudio");
    loadData("cc_channel");
    loadData("minimizeToTray");
    
    openImages();

    checkVersion();
    document.title += " " + version;
}

// Event listeners for changing settings
document.querySelector("#barrageCount").addEventListener("change", () => { clampValue(document.querySelector("#barrageCount"), 0, null); setData("barrageCount", parseInt(document.querySelector("#barrageCount").value)) });
document.querySelector("#barrageFrequency").addEventListener("change", () => { clampValue(document.querySelector("#barrageFrequency"), 0, null); setData("barrageFrequency", parseFloat(document.querySelector("#barrageFrequency").value)) });
document.querySelector("#throwDuration").addEventListener("change", () => { clampValue(document.querySelector("#throwDuration"), 0.1, null); setData("throwDuration", parseFloat(document.querySelector("#throwDuration").value)) });
document.querySelector("#returnSpeed").addEventListener("change", () => { clampValue(document.querySelector("#returnSpeed"), 0, null); setData("returnSpeed", parseFloat(document.querySelector("#returnSpeed").value)) });
document.querySelector("#throwAngleMin").addEventListener("change", () => { clampValue(document.querySelector("#throwAngleMin"), -90, parseFloat(document.querySelector("#throwAngleMax").value)); setData("throwAngleMin", parseFloat(document.querySelector("#throwAngleMin").value)) });
document.querySelector("#throwAngleMax").addEventListener("change", () => { clampValue(document.querySelector("#throwAngleMax"), parseFloat(document.querySelector("#throwAngleMin").value), null); setData("throwAngleMax", parseFloat(document.querySelector("#throwAngleMax").value)) });
document.querySelector("#spinSpeedMin").addEventListener("change", () => { clampValue(document.querySelector("#spinSpeedMin"), 0, parseFloat(document.querySelector("#spinSpeedMax").value)); setData("spinSpeedMin", parseFloat(document.querySelector("#spinSpeedMin").value)) });
document.querySelector("#spinSpeedMax").addEventListener("change", () => { clampValue(document.querySelector("#spinSpeedMax"), parseFloat(document.querySelector("#spinSpeedMin").value), null); setData("spinSpeedMax", parseFloat(document.querySelector("#spinSpeedMax").value)) });

document.querySelector("#closeEyes").addEventListener("change", () => {
    const val = document.querySelector("#closeEyes").checked;
    setData("closeEyes", val);
    if (val)
    {
        document.querySelector("#openEyes").checked = false;
        setData("openEyes", false);
    }
});

document.querySelector("#openEyes").addEventListener("change", () => {
    const val = document.querySelector("#openEyes").checked;
    setData("openEyes", val);
    if (val)
    {
        document.querySelector("#closeEyes").checked = false;
        setData("closeEyes", false);
    }
});

document.querySelector("#itemScaleMin").addEventListener("change", () => { clampValue(document.querySelector("#itemScaleMin"), 0, parseFloat(document.querySelector("#itemScaleMax").value)); setData("itemScaleMin", parseFloat(document.querySelector("#itemScaleMin").value)) });
document.querySelector("#itemScaleMax").addEventListener("change", () => { clampValue(document.querySelector("#itemScaleMax"), parseFloat(document.querySelector("#itemScaleMin").value), null); setData("itemScaleMax", parseFloat(document.querySelector("#itemScaleMax").value)) });
document.querySelector("#delay").addEventListener("change", () => { clampValue(document.querySelector("#delay"), 0, null); setData("delay", parseInt(document.querySelector("#delay").value)) } );
document.querySelector("#volume").addEventListener("change", () => { clampValue(document.querySelector("#volume"), 0, 1); setData("volume", parseFloat(document.querySelector("#volume").value)) });
document.querySelector("#portThrower").addEventListener("change", () => setData("portThrower", parseInt(document.querySelector("#portThrower").value)));
document.querySelector("#portVTubeStudio").addEventListener("change", () => setData("portVTubeStudio", parseInt(document.querySelector("#portVTubeStudio").value)));
document.querySelector("#cc_channel").addEventListener("change", () => setData("cc_channel", parseInt(document.querySelector("#cc_channel").value)));
document.querySelector("#minimizeToTray").addEventListener("change", () => setData("minimizeToTray", document.querySelector("#minimizeToTray").checked));

function clampValue(node, min, max)
{
    var val = node.value;
    if (min != null && val < min)
        val = min;
    if (max != null && val > max)
        val = max;
    node.value = val;
}

// -----------------
// Window Animations
// -----------------

var currentPanel = document.querySelector("#bonkImages"), playing = false;

// Window Event Listeners
document.querySelector("#header").addEventListener("click", () => { showPanelLarge("statusWindow"); });

document.querySelector("#calibrateButton").addEventListener("click", () => { showPanelLarge("statusWindow", true); });
document.querySelector("#settingsButton").addEventListener("click", () => { showPanelLarge("settings"); });
document.querySelector("#testBonksButton").addEventListener("click", () => { showPanelLarge("testBonks"); });

document.querySelector("#imagesButton").addEventListener("click", () => { showPanel("bonkImages"); });
document.querySelector("#soundsButton").addEventListener("click", () => { showPanel("bonkSounds"); });
document.querySelector("#customButton").addEventListener("click", () => { showPanel("customBonks"); });
document.querySelector("#eventsButton").addEventListener("click", () => { showPanel("events"); });

document.querySelectorAll(".windowBack").forEach((element) => { element.addEventListener("click", () => { back(); }) });

function showTab(show, hide, select, deselect)
{
    if (show == "soundTable")
        openSounds();

    for (var i = 0; i < hide.length; i++)
        document.querySelector("#" + hide[i]).classList.add("hidden");

    document.querySelector("#" + show).classList.remove("hidden");

    for (var i = 0; i < deselect.length; i++)
        document.querySelector("#" + deselect[i]).classList.remove("selectedTab");

    document.querySelector("#" + select).classList.add("selectedTab");
}

function removeAll(panel)
{
    panel.classList.remove("leftIn");
    panel.classList.remove("rightIn");
    panel.classList.remove("upIn");
    panel.classList.remove("downIn");

    panel.classList.remove("leftOut");
    panel.classList.remove("rightOut");
    panel.classList.remove("upOut");
    panel.classList.remove("downOut");
}

var panelStack = [];

function back()
{
    if (!playingLarge && openPanelLarge)
    {
        openPanelLarge = false;

        var anim = Math.floor(Math.random() * 4);
        switch (anim)
        {
            case 0:
                anim = "left";
                break;
            case 1:
                anim = "right";
                break;
            case 2:
                anim = "up";
                break;
            case 3:
                anim = "down";
                break;
        }

        removeAll(document.querySelector("#wideWindow"));
        document.querySelector("#wideWindow").classList.add(anim + "Out");

        if (currentPanelLarge.id == "statusWindow" && (status == 3 || status == 4 || status == 7))
        {
            cancelCalibrate = true;
            ipcRenderer.send("cancelCalibrate");
        }

        playingLarge = true;
        setTimeout(() => {
            currentPanelLarge.classList.add("hidden");
            currentPanelLarge = null;
            playingLarge = false;
            cancelCalibrate = false;
            document.querySelector("#wideWindow").classList.add("hidden");
        }, 500);
    }
    else if (panelStack.length > 0)
        showPanel(panelStack.pop(), false);
}

function showPanel(panel, stack)
{
    if (!playing)
    {
        if (document.querySelector("#" + panel) != currentPanel)
        {
            playing = true;

            var anim = Math.floor(Math.random() * 4);
            switch (anim)
            {
                case 0:
                    anim = "left";
                    break;
                case 1:
                    anim = "right";
                    break;
                case 2:
                    anim = "up";
                    break;
                case 3:
                    anim = "down";
                    break;
            }

            var oldPanel = currentPanel;
            removeAll(oldPanel);
            oldPanel.classList.add(anim + "Out");
            
            setTimeout(() => {
                oldPanel.classList.add("hidden");
            }, 500);

            if (stack == null)
                panelStack = [];

            if (stack == null || !stack)
            {

                document.querySelector("#sideBar").querySelectorAll(".overlayButton").forEach((element) => { element.classList.remove("buttonSelected"); });
    
                if (panel == "bonkImages")
                {
                    document.querySelector("#imagesButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openImages();
                }
                else if (panel == "bonkSounds")
                {
                    document.querySelector("#soundsButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openSounds();
                }
                else if (panel == "customBonks")
                {
                    document.querySelector("#customButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openBonks();
                }
                else if (panel == "events")
                {
                    document.querySelector("#eventsButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openEvents();
                }
            }
            else if (stack)
                panelStack.push(oldPanel.id);

            currentPanel = document.querySelector("#" + panel);
            currentPanel.classList.remove("hidden");
            removeAll(currentPanel);
            currentPanel.classList.add(anim + "In");

            setTimeout(() => {
                playing = false;
            }, 500);
        }
    }
}

var currentPanelLarge, playingLarge = false, openPanelLarge = false, cancelCalibrate = false;

function showPanelLarge(panel)
{
    if (!playingLarge)
    {
        if (document.querySelector("#" + panel) != currentPanelLarge)
        {
            var anim = Math.floor(Math.random() * 4);
            switch (anim)
            {
                case 0:
                    anim = "left";
                    break;
                case 1:
                    anim = "right";
                    break;
                case 2:
                    anim = "up";
                    break;
                case 3:
                    anim = "down";
                    break;
            }

            if (panel == "testBonks")
                openTestBonks();

            var oldPanel = currentPanelLarge;
            currentPanelLarge = document.querySelector("#" + panel);
            removeAll(currentPanelLarge);
            currentPanelLarge.classList.remove("hidden");

            if (!openPanelLarge)
            {
                openPanelLarge = true;
                removeAll(document.querySelector("#wideWindow"));
                document.querySelector("#wideWindow").classList.remove("hidden");
                document.querySelector("#wideWindow").classList.add(anim + "In");
            }
            else
            {
                if (oldPanel != null)
                {
                    if (oldPanel.id == "statusWindow" && (status == 3 || status == 4 || status == 7))
                        ipcRenderer.send("cancelCalibrate");

                    removeAll(oldPanel);
                    oldPanel.classList.add(anim + "Out");
                    setTimeout(() => {
                        oldPanel.classList.add("hidden");
                    }, 500);
                }
    
                currentPanelLarge.classList.add(anim + "In");
            }

            playingLarge = true;
            setTimeout(() => {
                playingLarge = false;
            }, 500);
        }
        else
            back();
    }
}

function checkVersion()
{
    var versionRequest = new XMLHttpRequest();
    versionRequest.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200)
        {
            const latestVersion = JSON.parse(this.responseText);
            if (latestVersion.latest > version)
                document.querySelector("#newVersion").classList.remove("hidden");
        }
    };
    // Open the request and send it.
    versionRequest.open("GET", "https://itch.io/api/1/x/wharf/latest?target=jayo89/jayobonk&channel_name=win32", true);
    versionRequest.send();
}

// -----------------------
// Testing and Calibration
// -----------------------

document.querySelector("#testSingle").addEventListener("click", () => { ipcRenderer.send("single"); });
document.querySelector("#testBarrage").addEventListener("click", () => { ipcRenderer.send("barrage"); });

document.querySelector("#calibrateButton").addEventListener("click", () => { if (!cancelCalibrate) ipcRenderer.send("startCalibrate"); });
document.querySelector("#nextCalibrate").addEventListener("click", () => { ipcRenderer.send("nextCalibrate"); });
document.querySelector("#cancelCalibrate").addEventListener("click", () => { ipcRenderer.send("cancelCalibrate"); back(); });

// Test a specific item
async function testItem(index)
{
    const throws = await getData("throws");
    ipcRenderer.send("testItem", throws[index]);
}

function testCustomBonk(customName)
{
    ipcRenderer.send("testCustomBonk", customName);
}