/*
*       360 degree beach panorama demo using generic sensors
*/

'use strict';

// If generic sensors are enabled and RelativeOrientationSensor is defined, create class normally
// Otherwise create a fake class
if ('RelativeOrientationSensor' in window) {

    // This is an inclination sensor that uses RelativeOrientationSensor
    // and converts the quaternion to Euler angles, returning the longitude and latitude
    window.RelativeInclinationSensor = class RelativeInclinationSensor extends RelativeOrientationSensor {
        constructor(options) {
            super(options);
            this.longitude_ = 0;
            this.latitude_ = 0;
            this.longitudeInitial_ = 0;
            this.initialOriObtained_ = false;
            this.func_ = null;

            super.onreading = () => {

                // Conversion to Euler angles done in THREE.js so we have to create a
                // THREE.js object for holding the quaternion to convert from
                // Order x,y,z,w
                let quaternion = new THREE.Quaternion(super.quaternion[0], super.quaternion[1],
                    super.quaternion[2], super.quaternion[3]);

                // euler will hold the Euler angles corresponding to the quaternion
                let euler = new THREE.Euler(0, 0, 0);

                // Order of rotations must be adapted depending on orientation
                // for portrait ZYX, for landscape ZXY
                let angleOrder = null;
                screen.orientation.angle === 0 ? angleOrder = 'ZYX' : angleOrder = 'ZXY';
                //angleOrder = 'ZXY';
                euler.setFromQuaternion(quaternion, angleOrder);
                if (!this.initialOriObtained_) {

                    // Initial longitude needed to make the initial camera orientation
                    // the same every time
                    this.longitudeInitial_ = -euler.z;
                    if (screen.orientation.angle === 90) {
                        this.longitudeInitial_ = this.longitudeInitial_ + Math.PI / 2;
                    }
                    this.initialOriObtained_ = true;
                }

                // Device orientation changes need to be taken into account
                // when reading the sensor values by adding offsets
                // Also the axis of rotation might change
                switch (screen.orientation.angle) {

                    // In case there are other screen orientation angle values,
                    // for example 180 degrees (not implemented in Chrome), default is used
                    default:
                    case 0:
                        this.longitude_ = -euler.z - this.longitudeInitial_;
                        this.latitude_ = euler.x - Math.PI / 2;
                        break;
                    case 90:
                        this.longitude_ = -euler.z - this.longitudeInitial_ + Math.PI / 2;
                        this.latitude_ = -euler.y - Math.PI / 2;
                        break;
                    case 270:
                        this.longitude_ = -euler.z - this.longitudeInitial_ - Math.PI / 2;
                        this.latitude_ = euler.y - Math.PI / 2;
                        break;
                }

                if (this.func_ !== null)
                    this.func_();
            };
        }

        set onreading(func) {
            this.func_ = func;
        }

        get longitude() {
            return this.longitude_;
            //return 0
        }

        get latitude() {
            return this.latitude_;
            //return 0
        };
    };
} else {

    // Fake interface
    window.RelativeInclinationSensor = class RelativeInclinationSensor {
        constructor(options) {
            this.start = function () { };
        }

        set onreading(func) { }

        get longitude() {
            return 0;
        }

        get latitude() {
            return 0;
        }
    };

    // Inform the user that generic sensors are not enabled
    document.getElementById("no-sensors").style.display = "block";
}

// Camera constants
const farPlane = 550, fov = 75;

// Required for a three.js scene
var camera, scene, renderer, oriSensor,

    cube,
    videoTexture, movieMaterial,
    mesh,
    material, texture,
    acl,

    controls,

    canvas, canvas_context, video, video_canvas;

video = document.getElementById('video');
canvas = document.getElementById('video_canvas');

initWebcam();

function initWebcam() {
    video = document.getElementById('video');
    canvas = document.getElementById('video_canvas');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(function (stream) {
            video.srcObject = stream;;
            video.play();
        })
        .catch(function (err) {
            console.log("An error occured! " + err);
        });

    video.onplaying = () => {
        // video.width = video.videoWidth;
        // video.height = video.videoHeight
        init()
    }

}

// Service worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        // navigator.serviceWorker.register('sw.js').then(function(registration) {
        // }, function(err) {
        // console.log('ServiceWorker registration failed: ', err);
        // });
    });
}

let speed = {
    x:0,
    y:0,
    z:0,
    ax:0,
    ay:0,
    az:0,
    timestamp:0
}

let i = 0.5
function getDriftValue(x){
    if(x > -i && x < 0){
        return x /2
    }else if(x > 0 && x < i){
        return x /2
    }
    return x
}

var koptions = {R: 0.01, Q: 3}
var kfx = new KalmanFilter(koptions)
var kfy = new KalmanFilter(koptions)
var kfz = new KalmanFilter(koptions)

function setToInitialState() {
    var shaking = false;

    function onreading() {
       
        if(speed.timestamp === 0){
            speed.ax = kfx.filter(acl.x)
            speed.ay = kfx.filter(acl.y)
            speed.az = kfx.filter(acl.z)
            speed.timestamp = speed.timestamp || acl.timestamp
            return;
        }
        // mesh.position.z += -acl.x * m
        // mesh.position.y += -acl.y * m
        // mesh.position.x += -acl.z * m
        speed.timestamp = speed.timestamp || acl.timestamp

        let time = (acl.timestamp - speed.timestamp) * 0.001
        
        const limit = 0.10,
            factor = 0.08
            
        var x = kfx.filter(acl.x),
            y = kfy.filter(acl.y),
            z = kfz.filter(acl.z)

        if ((x >= limit && x <= -limit) ||
        (y => limit && y <= -limit) ||
        (z => limit && z <= -limit)) {

            console.log(`x, y, z`, x, y, z)
            speed.x = speed.x + (x + speed.ax) / 2 * time
            speed.y = speed.y  + (y + speed.ay) / 2 * time
            speed.z = speed.z + (z + speed.az) / 2 * time

            // speed.x = speed.x + acl.x * time
            // speed.y = speed.y + acl.y * time
            // speed.z = speed.z + acl.z * time

            // speed.x *= factor
            // speed.y *= factor
            // speed.z *= factor

            // speed.x = getDriftValue(speed.x)
            // speed.y = getDriftValue(speed.y)
            // speed.z = getDriftValue(speed.z)
            
            //camera.translateX(speed.x)
            //camera.translateY(speed.y)
            //camera.translateZ(speed.z)
            //console.log(`acl.x, acl.y, acl.z`, acl.x, acl.y, acl.z, acl)
        }
        
        speed.timestamp = acl.timestamp
        speed.ax = x
        speed.ay = y
        speed.az = z
        
    }

    acl.addEventListener('reading', onreading);
}

// This function sets up the three.js scene, initializes the orientation sensor and 
// adds the canvas to the DOM
function init() {

    const container = document.querySelector('#app-view');
    let image = "resources/beach_dinner.jpg";

    // three.js scene setup below
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, farPlane);
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    oriSensor = new RelativeInclinationSensor({ frequency: 60, referenceFrame: "screen" });
    oriSensor.onreading = render;   // When the sensor sends new values, render again using those


    acl = new LinearAccelerationSensor({ frequency: 60 ,referenceFrame: "screen" });
    acl.addEventListener('activate', setToInitialState);
    acl.start();

    //videoTexture = new THREE.Texture( canvas );
    // videoTexture.minFilter = THREE.LinearFilter;
    // videoTexture.magFilter = THREE.LinearFilter;

    // movieMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, overdraw: true, side:THREE.DoubleSide } );
    //obj.children[i].material = movieMaterial;

    // var x = window.innerWidth / 2 - 300;
    // var y = window.innerHeight / 2 - 300;
    // var mesh = new THREE.Mesh(new THREE.PlaneGeometry(canvas.width, canvas.height, 10, 10), movieMaterial);
    // mesh.overdraw = true;
    // mesh.doubleSided = true;

    texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    material = new THREE.MeshBasicMaterial({ map: texture });

    //var geometry = new THREE.PlaneBufferGeometry( 9, 16 );
    var aspect = video.videoWidth / video.videoHeight
    var width = 660
    var geometry = new THREE.PlaneGeometry( width , width / aspect  );

    geometry.scale(0.5, 0.5, 0.5);

    mesh = new THREE.Mesh(geometry, material);

    //mesh.position.x = 0; //x - canvas.width / 2;
    //mesh.position.y = 0; //y - canvas.height / 2;
    //mesh.position.z = -10; //y - canvas.height / 2;
    mesh.position.x = -0; //y - canvas.height / 2;
    mesh.position.z = -300; //y - canvas.height / 2;
    scene.add(camera)
    camera.add(mesh)


    //mesh.lookAt( camera.position);

    //scene.add(mesh);

    var loader = new THREE.GLTFLoader();

    // Load a glTF resource
    loader.load(
        // resource URL
        'models/coke/scene.gltf',
        // called when the resource is loaded
        function ( gltf ) {

            gltf.scene.position.y = -25;
            gltf.scene.position.x = -100;
            gltf.scene.position.z = -50;
            scene.add( gltf.scene );

            gltf.animations; // Array<THREE.AnimationClip>
            gltf.scene; // THREE.Scene
            gltf.scenes; // Array<THREE.Scene>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object
        },
        // called while loading is progressing
        function ( xhr ) {

            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

        },
        // called when loading has errors
        function ( error ) {

            console.log( 'An error happened', error );

        }
    );


    //TEST CUBE
    cube = new THREE.Mesh(new THREE.CubeGeometry(10, 10, 10), new THREE.MeshNormalMaterial());
    cube.position.y = -25;
    cube.position.x = -100;
    cube.position.z = 0;
    scene.add(cube);

    // TextureLoader for loading the image file
    // let textureLoader = new THREE.TextureLoader();

    // // AudioLoader for loading the audio file
    // let audioLoader = new THREE.AudioLoader();

    // // Creating the sphere where the image will be projected and adding it to the scene
    // let sphere = new THREE.SphereGeometry(100, 100, 40);

    // // The sphere needs to be transformed for the image to render inside it
    // sphere.applyMatrix(new THREE.Matrix4().makeScale(-1, 1, 1));
    // let sphereMaterial = new THREE.MeshBasicMaterial();

    // // Use the image as the material for the sphere
    // sphereMaterial.map = textureLoader.load(image);

    // // Combining geometry and material produces the mesh with the image as its material
    // let sphereMesh = new THREE.Mesh(sphere, sphereMaterial);
    // //scene.add(sphereMesh);

    // // The sound needs to be attached to a mesh, here an invisible one,
    // // in order to be able to be positioned in the scene.
    // // Here the mesh is created and added to the scene
    // let soundmesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());

    // // The position of the mesh is where the sound will come from
    // // Important for directional sound
    // soundmesh.position.set(-40, 0, 0);
    // scene.add(soundmesh);

    // // Add an audio listener to the camera so we can hear the sound
    // let listener = new THREE.AudioListener();
    // camera.add(listener);

    // // Here the sound is loaded and attached to the mesh
    // let sound = new THREE.PositionalAudio(listener);
    // audioLoader.load('resources/ocean.mp3', function (buffer) {
    //     sound.setBuffer(buffer);
    //     sound.setLoop(true);
    //     sound.setRefDistance(40);
    //     sound.setRolloffFactor(1);
    //     //sound.play();
    // });
    // soundmesh.add(sound);
    
    controls = new DeviceOrientationController( camera, renderer.domElement );
    controls.connect();

    container.appendChild(renderer.domElement);

    // Sensor initialization
    oriSensor.start();


    // On window resize, also resize canvas so it fills the screen
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);

    render();
}

// Renders the scene, orienting the camera according to the longitude and latitude
function render() {
    // cube.rotation.x += 0.02;
    // cube.rotation.y += 0.0225;
    // cube.rotation.z += 0.0175;

    controls.update();

    // let targetX = (farPlane / 2) * Math.sin(Math.PI / 2 - oriSensor.latitude) * Math.cos(oriSensor.longitude);
    // let targetY = (farPlane / 2) * Math.cos(Math.PI / 2 - oriSensor.latitude);
    // let targetZ = (farPlane / 2) * Math.sin(Math.PI / 2 - oriSensor.latitude) * Math.sin(oriSensor.longitude);
    //camera.lookAt(new THREE.Vector3(targetX, targetY, targetZ));
    //console.log('targetX, targetY, targetZ', targetX, targetY, targetZ)

    let target = THREE.Utils.cameraLookDir(camera);

    //let targetX = camera

    // canvas_context = canvas.getContext('2d');
    // canvas_context.drawImage(video, 0, 0, 320, 240);
    //videoTexture.needsUpdate = true;
    texture.needsUpdate = true;

    // mesh.position.x = targetX; //x - canvas.width / 2;
    // mesh.position.y = targetY; //y - canvas.height / 2;
    // mesh.position.z = targetZ;

    // mesh.position.x = target.x + 200; //x - canvas.width / 2;
    // mesh.position.y = target.y + 200; //y - canvas.height / 2;
    // mesh.position.z = target.z + 200;

    // mesh.lookAt(camera.position);

    renderer.render(scene, camera);
}

THREE.Utils = {
    cameraLookDir: function(camera) {
        var vector = new THREE.Vector3(0, 0, 0);
        //vector.applyEuler(camera.rotation, camera.rotation.order);
        vector.applyQuaternion( camera.quaternion );
        return vector;
    }
};


(function () { var script = document.createElement('script'); script.onload = function () { var stats = new Stats(); document.body.appendChild(stats.dom); requestAnimationFrame(function loop() { stats.update(); requestAnimationFrame(loop) }); }; script.src = '//mrdoob.github.io/stats.js/build/stats.min.js'; document.head.appendChild(script); })()