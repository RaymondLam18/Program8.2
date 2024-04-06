import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

import kNear from "./knear.js"

const k = 2
const machine = new kNear(k);
let dataSet = []

await fetch ('./handsign_data.json')
    .then((response) => response.json())
    .then((json) => dataSet = json)

dataSet.sort(() => Math.random() - 0.5);

const trainSize = Math.floor(dataSet.length * 0.8);
const trainData = dataSet.slice(0, trainSize);
const testData = dataSet.slice(trainSize);

for (let i = 0; i < trainData.length; i++) {
    machine.learn(trainData[i].pose, trainData[i].label);
}

let correctPredictions = 0;
let totalTestPoses = 0;

for (const testPose of testData) {
    const prediction = machine.classify(testPose.pose);
    console.log(`Predicted: ${prediction}, Actual: ${testPose.label}`);

    if (prediction === testPose.label) {
        correctPredictions++;
    }
    totalTestPoses++;
}

const accuracy = (correctPredictions / totalTestPoses) * 100;
console.log(`Accuracy: ${accuracy.toFixed(2)}%`);


const demosSection = document.getElementById("demos");
let handLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;
let flattenedVideoLandmarks;

const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2
    });
    demosSection.classList.remove("invisible");
};
createHandLandmarker();

const flattenCoordinates = (landmarks) => {
    const flattenedCoordinates = [];
    landmarks.forEach((landmark) => {
        flattenedCoordinates.push(landmark.x, landmark.y, landmark.z);
    });
    return flattenedCoordinates;
};

const imageContainers = document.getElementsByClassName("detectOnClick");
for (let i = 0; i < imageContainers.length; i++) {
    imageContainers[i].children[0].addEventListener("click", handleClick);
}

async function handleClick(event) {
    if (!handLandmarker) {
        console.log("Wait for handLandmarker to load before clicking!");
        return;
    }
    if (runningMode === "VIDEO") {
        runningMode = "IMAGE";
        await handLandmarker.setOptions({ runningMode: "IMAGE" });
    }

    const allCanvas = event.target.parentNode.getElementsByClassName("canvas");
    for (var i = allCanvas.length - 1; i >= 0; i--) {
        const n = allCanvas[i];
        n.parentNode.removeChild(n);
    }

    const handLandmarkerResult = handLandmarker.detect(event.target);
    if (handLandmarkerResult.landmarks && handLandmarkerResult.landmarks.length > 0) {
        const flattenedCoordinates = flattenCoordinates(handLandmarkerResult.landmarks[0]);
        console.log(flattenedCoordinates);

        const canvas = document.createElement("canvas");
        canvas.setAttribute("class", "canvas");
        canvas.setAttribute("width", event.target.naturalWidth + "px");
        canvas.setAttribute("height", event.target.naturalHeight + "px");
        canvas.style =
            "left: 0px;" +
            "top: 0px;" +
            "width: " +
            event.target.width +
            "px;" +
            "height: " +
            event.target.height +
            "px;";
        event.target.parentNode.appendChild(canvas);
        const cxt = canvas.getContext("2d");
        for (const landmarks of handLandmarkerResult.landmarks) {
            drawConnectors(cxt, landmarks, HAND_CONNECTIONS, {
                color: "#00FF00",
                lineWidth: 5
            });
            drawLandmarks(cxt, landmarks, { color: "#FF0000", lineWidth: 1 });
        }
    }
}

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const hasGetUserMedia = () => { var _a; return !!((_a = navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.getUserMedia); };
if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
}
else {
    console.warn("getUserMedia() is not supported by your browser");
}

function enableCam() {
    if (!handLandmarker) {
        console.log("Wait! objectDetector not loaded yet.");
        return;
    }
    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerText = "ENABLE PREDICTIONS";
    }
    else {
        webcamRunning = true;
        enableWebcamButton.innerText = "DISABLE PREDICTIONS";
    }
    const constraints = {
        video: true
    };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
    });
}

let lastVideoTime = -1;
let results = undefined;

async function predictWebcam() {
    canvasElement.style.width = video.videoWidth;
    canvasElement.style.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await handLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = handLandmarker.detectForVideo(video, startTimeMs);
    }
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (results.landmarks && results.landmarks.length > 0) {
        for (const landmarks of results.landmarks) {
            flattenedVideoLandmarks = flattenCoordinates(landmarks);

            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: "#00FF00",
                lineWidth: 5
            });
            drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
        }
    }
    canvasCtx.restore();
    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

document.getElementById('predictButton').addEventListener('click', function() {
    if (flattenedVideoLandmarks) {
        predictHandPose(flattenedVideoLandmarks);
    } else {
        console.log("No landmarks available for prediction.");
    }
});

function predictHandPose(flattenedVideoLandmarks) {
    let prediction = machine.classify(flattenedVideoLandmarks);
    const predictionElement = document.getElementById('prediction');
    predictionElement.textContent = `I think this is a ${prediction}`;
}
