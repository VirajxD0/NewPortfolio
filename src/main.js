import './style.css';
import { createScene } from './scene.js';
import { initScroll } from './scroll.js';
import { initAccordion } from './accordion.js';

const container = document.getElementById('canvas-container');
const { scene, camera, renderer, cameraViews, updateAnimations, controls } = createScene(container);

const sectionTexts = document.querySelectorAll('.section-text');
const dots = document.querySelectorAll('.section-number .dot');
const scrollIndicator = document.querySelector('.scroll-indicator');

const scroll = initScroll(camera, cameraViews, sectionTexts, dots, scrollIndicator);

let freeRoam = false;
const roamBtn = document.getElementById('roam-toggle');
roamBtn.addEventListener('click', () => {
  freeRoam = !freeRoam;
  controls.enabled = freeRoam;
  roamBtn.classList.toggle('active', freeRoam);
  roamBtn.textContent = freeRoam ? 'Scroll Mode' : 'Free Roam';
  scrollIndicator.style.opacity = freeRoam ? '0' : '1';
});

let time = 0;
renderer.setAnimationLoop(() => {
  time += 0.016;
  if (!freeRoam) scroll.tick();
  updateAnimations(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initAccordion();
