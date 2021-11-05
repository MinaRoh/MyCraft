// import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/build/three.module.js';
// import {OrbitControls} from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/examples/jsm/controls/OrbitControls.js';
// import {GUI} from 'https://threejsfundamentals.org/threejs/../3rdparty/dat.gui.module.js';

class VoxelWorld {
  constructor(options) {
    this.cellSize = options.cellSize;
    this.tileSize = options.tileSize;
    this.tileTextureWidth = options.tileTextureWidth;
    this.tileTextureHeight = options.tileTextureHeight;
    const {cellSize} = this;
    this.cellSliceSize = cellSize * cellSize;
    this.cells = {};
  }
  computeVoxelOffset(x, y, z) {
    const {cellSize, cellSliceSize} = this;
    const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
    const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
    const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;
    return voxelY * cellSliceSize +
           voxelZ * cellSize +
           voxelX;
  }
  computeCellId(x, y, z) {
    const { cellSize } = this;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    return `${cellX},${cellY},${cellZ}`;
  }
  getCellForVoxel(x, y, z) {
    return this.cells[this.computeCellId(x, y, z)]
  }
  setVoxel(x, y, z, v) {
    let cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      cell = this.addCellForVoxel(x, y, z);
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    cell[voxelOffset] = v;
  }
  addCellForVoxel(x, y, z) {
    const cellId = this.computeCellId(x, y, z);
    let cell = this.cells[cellId];
    if (!cell) {
      const { cellSize } = this;
      cell = new Uint8Array(cellSize * cellSize * cellSize);
      this.cells[cellId] = cell;
    }
    return cell;
  }
  getVoxel(x, y, z) {
    const cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      return 0;
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    return cell[voxelOffset];
  }
  generateGeometryDataForCell(cellX, cellY, cellZ) {
    const {cellSize, tileSize, tileTextureWidth, tileTextureHeight} = this;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const startX = cellX * cellSize;
    const startY = cellY * cellSize;
    const startZ = cellZ * cellSize;

    for (let y = 0; y < cellSize; ++y) {
      const voxelY = startY + y;
      for (let z = 0; z < cellSize; ++z) {
        const voxelZ = startZ + z;
        for (let x = 0; x < cellSize; ++x) {
          const voxelX = startX + x;
          const voxel = this.getVoxel(voxelX, voxelY, voxelZ);
          if (voxel) {
            // voxel 0 is sky (empty) so for UVs we start at 0
            const uvVoxel = voxel - 1;
            // There is a voxel here but do we need faces for it?
            for (const {dir, corners, uvRow} of VoxelWorld.faces) {
              const neighbor = this.getVoxel(
                  voxelX + dir[0],
                  voxelY + dir[1],
                  voxelZ + dir[2]);
              if (!neighbor) {
                // this voxel has no neighbor in this direction so we need a face.
                const ndx = positions.length / 3;
                for (const {pos, uv} of corners) {
                  positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
                  normals.push(...dir);
                  uvs.push(
                        (uvVoxel +   uv[0]) * tileSize / tileTextureWidth,
                    1 - (uvRow + 1 - uv[1]) * tileSize / tileTextureHeight);
                }
                indices.push(
                  ndx, ndx + 1, ndx + 2,
                  ndx + 2, ndx + 1, ndx + 3,
                );
              }
            }
          }
        }
      }
    }

    return {
      positions,
      normals,
      uvs,
      indices,
    };
  }
  intersectRay(start, end) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const len = Math.sqrt(lenSq);

    dx /= len;
    dy /= len;
    dz /= len;

    let t = 0.0;
    let ix = Math.floor(start.x);
    let iy = Math.floor(start.y);
    let iz = Math.floor(start.z);

    const stepX = (dx > 0) ? 1 : -1;
    const stepY = (dy > 0) ? 1 : -1;
    const stepZ = (dz > 0) ? 1 : -1;

    const txDelta = Math.abs(1 / dx);
    const tyDelta = Math.abs(1 / dy);
    const tzDelta = Math.abs(1 / dz);

    const xDist = (stepX > 0) ? (ix + 1 - start.x) : (start.x - ix);
    const yDist = (stepY > 0) ? (iy + 1 - start.y) : (start.y - iy);
    const zDist = (stepZ > 0) ? (iz + 1 - start.z) : (start.z - iz);

    // location of nearest voxel boundary, in units of t
    let txMax = (txDelta < Infinity) ? txDelta * xDist : Infinity;
    let tyMax = (tyDelta < Infinity) ? tyDelta * yDist : Infinity;
    let tzMax = (tzDelta < Infinity) ? tzDelta * zDist : Infinity;

    let steppedIndex = -1;

    // main loop along raycast vector
    while (t <= len) {
      const voxel = this.getVoxel(ix, iy, iz);
      if (voxel) {
        return {
          position: [
            start.x + t * dx,
            start.y + t * dy,
            start.z + t * dz,
          ],
          normal: [
            steppedIndex === 0 ? -stepX : 0,
            steppedIndex === 1 ? -stepY : 0,
            steppedIndex === 2 ? -stepZ : 0,
          ],
          voxel,
        };
      }

      // advance t to next nearest voxel boundary
      if (txMax < tyMax) {
        if (txMax < tzMax) {
          ix += stepX;
          t = txMax;
          txMax += txDelta;
          steppedIndex = 0;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      } else {
        if (tyMax < tzMax) {
          iy += stepY;
          t = tyMax;
          tyMax += tyDelta;
          steppedIndex = 1;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      }
    }
    return null;
  }
}


/*  texture atlas setting */

VoxelWorld.faces = [
  { // left
    uvRow: 0,
    dir: [ -1,  0,  0, ],
    corners: [
      { pos: [ 0, 1, 0 ], uv: [ 0, 1 ], },
      { pos: [ 0, 0, 0 ], uv: [ 0, 0 ], },
      { pos: [ 0, 1, 1 ], uv: [ 1, 1 ], },
      { pos: [ 0, 0, 1 ], uv: [ 1, 0 ], },
    ],
  },
  { // right
    uvRow: 0,
    dir: [  1,  0,  0, ],
    corners: [
      { pos: [ 1, 1, 1 ], uv: [ 0, 1 ], },
      { pos: [ 1, 0, 1 ], uv: [ 0, 0 ], },
      { pos: [ 1, 1, 0 ], uv: [ 1, 1 ], },
      { pos: [ 1, 0, 0 ], uv: [ 1, 0 ], },
    ],
  },
  { // bottom
    uvRow: 1,
    dir: [  0, -1,  0, ],
    corners: [
      { pos: [ 1, 0, 1 ], uv: [ 1, 0 ], },
      { pos: [ 0, 0, 1 ], uv: [ 0, 0 ], },
      { pos: [ 1, 0, 0 ], uv: [ 1, 1 ], },
      { pos: [ 0, 0, 0 ], uv: [ 0, 1 ], },
    ],
  },
  { // top
    uvRow: 2,
    dir: [  0,  1,  0, ],
    corners: [
      { pos: [ 0, 1, 1 ], uv: [ 1, 1 ], },
      { pos: [ 1, 1, 1 ], uv: [ 0, 1 ], },
      { pos: [ 0, 1, 0 ], uv: [ 1, 0 ], },
      { pos: [ 1, 1, 0 ], uv: [ 0, 0 ], },
    ],
  },
  { // back
    uvRow: 0,
    dir: [  0,  0, -1, ],
    corners: [
      { pos: [ 1, 0, 0 ], uv: [ 0, 0 ], },
      { pos: [ 0, 0, 0 ], uv: [ 1, 0 ], },
      { pos: [ 1, 1, 0 ], uv: [ 0, 1 ], },
      { pos: [ 0, 1, 0 ], uv: [ 1, 1 ], },
    ],
  },
  { // front
    uvRow: 0,
    dir: [  0,  0,  1, ],
    corners: [
      { pos: [ 0, 0, 1 ], uv: [ 0, 0 ], },
      { pos: [ 1, 0, 1 ], uv: [ 1, 0 ], },
      { pos: [ 0, 1, 1 ], uv: [ 0, 1 ], },
      { pos: [ 1, 1, 1 ], uv: [ 1, 1 ], },
    ],
  },
];

function main() {
  const canvas = document.querySelector('#gl-canvas');
  const renderer = new THREE.WebGLRenderer({canvas});
  // shadow rendering call
  renderer.shadowMap.enabled = true;

  const cellSize = 50;

  const fov = 45;
  const aspect = 2;  // the canvas default
  const near = 0.1;
  const far = 1000;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  //camera.position.set(-cellSize * .3, cellSize * .1, -cellSize * .3);

  /* //orbitcontrol
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.set(cellSize / 2, cellSize / 3, cellSize / 2);
  controls.update();
  */

  camera.position.set(25, 15, 80);//시작 좌표
  const controls = new THREE.FlyControls(camera, canvas);
  controls.movementSpeed = 0.1;
  controls.autoForward = false;
  controls.dragToLook = true;
  controls.update(1);


  const scene = new THREE.Scene();
  scene.background = new THREE.Color('skyblue');

  /* AmbientLight 자연광 */
  const color = 0xFFFFFF;
  var intensity = 0.5;
  var light = new THREE.AmbientLight(color, intensity);
  scene.add(light);
 
  function addLight(x, y, z) {
    // const color = 0xFFFFFF;
    intensity = 0.5;
    light = new THREE.DirectionalLight(color, intensity);
    // shadow & shadow camera setting
    light.castShadow = true;
    light.shadow.bias = -0.01;  // 줄무늬 안생기게
    light.shadowDarkness = 0.5;
    light.shadowCameraNear = 2;
    light.shadowCameraFar = 70;
    light.shadowCameraLeft = -30;
    light.shadowCameraRight = 30;
    light.shadowCameraTop = 30;
    light.shadowCameraBottom = -30;
    light.position.set(x, y, z);
    // 빛이 비추는 방향 target
    light.target.position.set(25, 0, 25);
    scene.add(light, light.target);

    /* 빛 위치를 표시해줌 */
    const helper = new THREE.DirectionalLightHelper(light);
    scene.add(helper);

    const cameraHelper = new THREE.CameraHelper(light.shadow.camera);
    scene.add(cameraHelper);
  }
  // 빛의 시작 지점
  addLight(50, 30, 25);
  // addLight( 1, -1, -2);

  function updateLight() {
    light.target.updateMatrixWorld();
    helper.update();
  }
  
  /* slider 관련 코드 -- 실행 X

  var setx = document.getElementById("setx");
  setx.addEventListener("input", moveX);

  function moveX()
  
  // 빛을 x, y, z 축으로 움직임 - x축을 움직이는 것을 기준으로 만들기 
  class ColorGUIHelper {
    constructor(object, prop) {
      this.object = object;
      this.prop = prop;
    }
    get value() {
      return `#${this.object[this.prop].getHexString()}`;
    }
    set value(hexString) {
      this.object[this.prop].set(hexString);
    }
  }

  function makeXYZGUI(gui, vector3, name, onChangeFn) {
    const folder = gui.addFolder(name);
    folder.add(vector3, 'x', -10, 10).onChange(onChangeFn);
    folder.add(vector3, 'y', 0, 10).onChange(onChangeFn);
    folder.add(vector3, 'z', -10, 10).onChange(onChangeFn);
    folder.open();
  }

  const gui = new dat.GUI();
  gui.addColor(new ColorGUIHelper(light, 'color'), 'value').name('color');
  
  gui.add(light, 'intensity', 0, 2, 0.01);
  gui.add(light, 'distance', 0, 40).onChange(updateLight);
  
  makeXYZGUI(gui, light.position, 'position', updateLight);
  */

  /* 배경에 구름 */
  function createClouds(radius, segments) {
    // Mesh
    return new THREE.Mesh(
        // geometry
        new THREE.SphereGeometry(radius, segments, segments),
        // material
        new THREE.MeshBasicMaterial({
            map:    THREE.ImageUtils.loadTexture('src/images/fair_clouds_4k.png'),
            side:   THREE.BackSide,
            transparent:    true
        })
    );
  }
  
  /* 큰 구 생성 */
  var clouds = createClouds(80, 64); 
  /* 구 위치 조정 */
  clouds.position.set( 25, 20, 30 );
  scene.add(clouds);

  // bring textuers
  /*  bring textuers */  
  const loader = new THREE.TextureLoader();
  let texture = loader.load(src="src/textures/texture_test.png"); //직접 지정
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const tileSize = 1024;
  const tileTextureWidth = 16384;
  const tileTextureHeight = 4096;
  const world = new VoxelWorld({
    cellSize,
    tileSize,
    tileTextureWidth,
    tileTextureHeight,
  });

  // function randInt(min, max) {
  //   return Math.floor(Math.random() * (max - min) + min);
  // }

  // const {positions, normals, uvs, indices} = world.generateGeometryDataForCell(0, 0, 0);
  // const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
    transparent: true,
  });

  const cellIdToMesh = {};
  function updateCellGeometry(x, y, z) {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    const cellId = world.computeCellId(x, y, z);
    let mesh = cellIdToMesh[cellId];
    const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry();

    const {positions, normals, uvs, indices} = world.generateGeometryDataForCell(cellX, cellY, cellZ);
    const positionNumComponents = 3;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
    const normalNumComponents = 3;
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
    const uvNumComponents = 2;
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), uvNumComponents));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    if (!mesh) {
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = cellId;
      cellIdToMesh[cellId] = mesh;
      // object위에 그림자를 드리우게 하는 것 
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      mesh.position.set(cellX * cellSize, cellY * cellSize, cellZ * cellSize);
    }
  }

  const neighborOffsets = [
    [ 0,  0,  0], // self
    [-1,  0,  0], // left
    [ 1,  0,  0], // right
    [ 0, -1,  0], // down
    [ 0,  1,  0], // up
    [ 0,  0, -1], // back
    [ 0,  0,  1], // front
  ];
  function updateVoxelGeometry(x, y, z) {
    const updatedCellIds = {};
    for (const offset of neighborOffsets) {
      const ox = x + offset[0];
      const oy = y + offset[1];
      const oz = z + offset[2];
      const cellId = world.computeCellId(ox, oy, oz);
      if (!updatedCellIds[cellId]) {
        updatedCellIds[cellId] = true;
        updateCellGeometry(ox, oy, oz);
      }
    }
  }
  
  for (let y = 0; y < cellSize; ++y) {
    for (let z = 0; z < cellSize; ++z) {
      for (let x = 0; x < cellSize; ++x) {
        let height = 3;
        // const height = (Math.sin(x / cellSize * Math.PI * 2) + Math.sin(z / cellSize * Math.PI * 3)) * (cellSize / 6) + (cellSize / 2);
        if (y < height) {
          world.setVoxel(x, y, z, 1);
          // world.setVoxel(x, y, z, 1); //마지막 숫자번째 texture 사용
          // texture = loader.load(src="src/textures/marble_01_1k.png"); //직접 지정
        }
        // else if(y==height){
        //   // world.setVoxel(x, y, z, 1); //1번째 texture 사용
        //   texture = loader.load(src="src/textures/brick_wall_001_1k.png"); //직접 지정
        // }
        // world.setVoxel(x, y, z, 1); //1번째 texture 사용
        
        
      }
    }
  }
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
  }

  updateVoxelGeometry(0,0,0);  // 0,0,0 will generate

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  let renderRequested = false;

  function render() {
    //renderRequested = undefined;
    renderRequested = false
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    //controls.update();
    controls.update(1);
    requestAnimationFrame(render);
    renderer.render(scene, camera);
  }
  render();

  let currentVoxel = 0;
  let currentId;
  
  document.querySelectorAll('#ui .tiles input[type=radio][name=voxel]').forEach((elem) => {
    elem.addEventListener('click', allowUncheck);
  });
  
  function allowUncheck() {
    if (this.id === currentId) {
      this.checked = false;
      currentId = undefined;
      currentVoxel = 0;
    } else {
      currentId = this.id;
      currentVoxel = parseInt(this.value);
    }
  }

  function getCanvasRelativePosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width  / rect.width,
      y: (event.clientY - rect.top ) * canvas.height / rect.height,
    };
  }
  
  let placeVoxelCount = 0;
  let userlevel = 0;
  let width = 0;
  const levelWeight = 0.1;
  const level = document.querySelector("#levelText");
  level.innerText = `Lv. ${userlevel}`; // 유저 레벨 표시


  function placeVoxel(event) {
    const pos = getCanvasRelativePosition(event);
    const x = (pos.x / canvas.width ) *  2 - 1;
    const y = (pos.y / canvas.height) * -2 + 1;  // Y축을 뒤집었음
   
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    start.setFromMatrixPosition(camera.matrixWorld);
    end.set(x, y, 1).unproject(camera);
   
    const intersection = world.intersectRay(start, end);
    if (intersection) {

      var isRightButton;
      event = event || window.event;

      if ("which" in event)  // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
        isRightButton = event.which == 3; 
      else if ("button" in event)  // IE, Opera 
        isRightButton = event.button == 2; 

      const voxelId = isRightButton ? currentVoxel : 0;
      /**
       * 교차점은 면 위에 있습니다. 이는 수학적 오차로 인해 교차점이 면의 양면
       * 어디로 떨어질지 모른다는 이야기죠.
       * 그래서 복셀을 제거하는 경우(currentVoxel = 0)는 normal의 값을 반으로
       * 줄이고, 추가하는 경우(currentVoxel > 0)에는 방향을 바꾼 뒤 반만큼 줄입니다.
       **/
      const pos = intersection.position.map((v, ndx) => {
        return v + intersection.normal[ndx] * (voxelId > 0 ? 0.5 : -0.5);
      });
      //범위 벗어나면 생성 못함
      if((pos[0] > 0 && pos[0] < 50) && (pos[2] > 0 && pos[2] < 50)){
        world.setVoxel(...pos, voxelId);
        updateVoxelGeometry(...pos);
        requestRenderIfNotRequested();



         // 레벨 관련 부분
         if(voxelId!=0){ // 블럭 생성시만
       
          placeVoxelCount += levelWeight;
          console.log("placeVoxelCount:", placeVoxelCount);
          placeVoxelCount = parseFloat(placeVoxelCount.toFixed(1)); //소수점 아래 한자리로 고정
          moveProgress();
          if(placeVoxelCount % 1 == 0){
            // userlevel += 1;
            levelup();
           
          }
        }

        
      }


       

        
    }
  }

  
   
  const mouse = {
    x: 0,
    y: 0,
  };
   


  function levelup(){
    userlevel += 1;
    console.log("user level up!! current level:", userlevel);
    level.innerText = `Lv. ${userlevel}`; // 유저 레벨 표시
    
    

  }

  function moveProgress(){
    const ele=document.getElementById('progsNum');

    
        if(width>=90){
            width = 0;
            ele.style.width=width+"%";
            ele.innerHTML=width+"%";
        }else{
            width = width + levelWeight*100;
            ele.style.width=width+"%";
            ele.innerHTML=width+"%";
        } 

      console.log('width:', width);
}
  




  
  function recordStartPosition(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moveX = 0;
    mouse.moveY = 0;
  }
  function recordMovement(event) {
    mouse.moveX += Math.abs(mouse.x - event.clientX);
    mouse.moveY += Math.abs(mouse.y - event.clientY);
  }
  function placeVoxelIfNoMovement(event) {
    if (mouse.moveX < 5 && mouse.moveY < 5) {
      placeVoxel(event);
    }
    window.removeEventListener('pointermove', recordMovement);
    window.removeEventListener('pointerup', placeVoxelIfNoMovement);
  }
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    recordStartPosition(event);
    window.addEventListener('pointermove', recordMovement);
    window.addEventListener('pointerup', placeVoxelIfNoMovement);
  }, { passive: false });
  canvas.addEventListener('touchstart', (event) => {
    // prevent scrolling
    event.preventDefault();
  }, { passive: false });

  function requestRenderIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  //controls.addEventListener('change', requestRenderIfNotRequested);
  //window.addEventListener('resize', requestRenderIfNotRequested);
}

main();
// let i =0;
//  function back(){
//    i = Math.abs(--i)%3;
//    var url = 'url("flourish-cc-by-nc-sa'.concat(i,'.png")');
//    console.log(i);
//    var ui = document.getElementById("ui")
//    var tiles = ui.querySelectorAll("input[type=radio] + label")
//    for(var j = 0; j<16; j++){
//      tiles[j].style.backgroundImage = url;
//    }    
//  }
//  function forth(){
//    i = Math.abs(++i)%3;
//    var url = 'url("flourish-cc-by-nc-sa'.concat(i,'.png")');
//    var ui = document.getElementById("ui")
//    var tiles = ui.querySelectorAll("input[type=radio] + label")
//    for(var j = 0; j<16; j++){
//      tiles[j].style.backgroundImage = url;

//    }     
//  }

