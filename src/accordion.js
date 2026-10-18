export function initAccordion() {
  document.querySelectorAll('.project-head').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.project');
      const isOpen = card.classList.contains('open');
      document.querySelectorAll('.project.open').forEach((c) => {
        c.classList.remove('open');
        const b = c.querySelector('.project-head');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        card.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}
