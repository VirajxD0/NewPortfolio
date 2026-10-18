import * as THREE from 'three';

export function initScroll(camera, cameraViews, sectionTexts, dots, scrollIndicator) {
  let currentScroll = 0;
  let targetScroll = 0;

  window.addEventListener('scroll', () => {
    targetScroll = window.scrollY;
  });

  function tick() {
    currentScroll += (targetScroll - currentScroll) * 0.08;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = Math.max(0, Math.min(1, currentScroll / scrollHeight));
    const sectionProgress = progress * (cameraViews.length - 1);
    const currentIndex = Math.floor(sectionProgress);
    const t = sectionProgress - currentIndex;
    const nextIndex = Math.min(currentIndex + 1, cameraViews.length - 1);
    const easedT = t * t * (3 - 2 * t);

    const currentView = cameraViews[currentIndex];
    const nextView = cameraViews[nextIndex];

    camera.position.lerpVectors(currentView.pos, nextView.pos, easedT);
    const targetLook = new THREE.Vector3().lerpVectors(currentView.lookAt, nextView.lookAt, easedT);
    camera.lookAt(targetLook);

    sectionTexts.forEach((text, i) => {
      const distance = Math.abs(sectionProgress - i);
      text.classList.toggle('visible', distance < 0.6);
    });

    const activeIndex = Math.round(sectionProgress);
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === activeIndex);
    });

    if (progress > 0.05) {
      scrollIndicator.style.opacity = '0';
    } else {
      scrollIndicator.style.opacity = '1';
    }
  }

  return { tick };
}
