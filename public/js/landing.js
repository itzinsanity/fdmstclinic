'use strict';

// Navbar scroll effect
const navbar = document.getElementById('mainNav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// Mobile nav toggle
navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  navToggle.classList.toggle('open');
});

// Close mobile nav on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
  });
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 70;
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// Animated stat counters
const animateCounter = (el, target, suffix) => {
  let current = 0;
  const step = Math.ceil(target / 60);
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = current.toLocaleString();
  }, 25);
};

// Intersection observer for stat counters
const statNumbers = document.querySelectorAll('.stat-number[data-target]');
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.dataset.animated) {
      entry.target.dataset.animated = 'true';
      const target = parseInt(entry.target.dataset.target);
      animateCounter(entry.target, target);
    }
  });
}, { threshold: 0.5 });

statNumbers.forEach(el => statsObserver.observe(el));

// Intersection observer for section animations
const fadeTargets = document.querySelectorAll(
  '.service-card, .why-feature, .step-card, .testimonial-card, .contact-item, .kpi-card, .hero-card-float'
);

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, idx) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, idx * 80);
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

fadeTargets.forEach(el => {
  el.classList.add('fade-on-scroll');
  fadeObserver.observe(el);
});

// Redirect logged-in users to their dashboard
(function () {
  const token = localStorage.getItem('fdmst_token');
  const user = localStorage.getItem('fdmst_user');
  if (token && user) {
    try {
      const parsed = JSON.parse(user);
      const loginBtn = document.querySelector('a[href="/login.html"]');
      const registerBtn = document.querySelector('a[href="/register.html"]');
      if (loginBtn) loginBtn.textContent = 'My Dashboard';
      if (loginBtn) {
        loginBtn.href = parsed.role === 'admin'
          ? '/dashboard/admin.html'
          : parsed.role === 'staff'
          ? '/dashboard/staff.html'
          : '/dashboard/patient.html';
      }
      if (registerBtn) registerBtn.style.display = 'none';
    } catch (_) {}
  }
})();

/* ─────────────────────────────── SUPPORT / PROMO PANEL ─────────────────── */

function openSupportPanel() {
  document.getElementById('supportPanel').classList.add('open');
  document.getElementById('supportOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSupportPanel() {
  document.getElementById('supportPanel').classList.remove('open');
  document.getElementById('supportOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function submitSupportForm(e) {
  e.preventDefault();

  const nameEl  = document.getElementById('supportName');
  const emailEl = document.getElementById('supportEmail');
  const phoneEl = document.getElementById('supportPhone');
  const nameErr  = document.getElementById('supportNameErr');
  const emailErr = document.getElementById('supportEmailErr');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  let valid = true;

  nameErr.textContent  = '';
  emailErr.textContent = '';

  if (!nameEl.value.trim()) {
    nameErr.textContent = 'Please enter your name.';
    valid = false;
  }
  if (!emailEl.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
    emailErr.textContent = 'Please enter a valid email address.';
    valid = false;
  }
  if (!valid) return;

  // Collect checked services
  const selectedServices = [...document.querySelectorAll('.support-checkboxes input[type="checkbox"]:checked')]
    .map(cb => cb.value);

  const payload = {
    name:     nameEl.value.trim(),
    email:    emailEl.value.trim(),
    phone:    phoneEl?.value.trim() || '',
    services: selectedServices
  };

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

  fetch('/api/promotions/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById('supportPanelBody').style.display = 'none';
        document.getElementById('supportSuccess').style.display  = 'flex';
      } else {
        const msg = data.errors?.[0]?.msg || data.message || 'Something went wrong. Please try again.';
        emailErr.textContent = msg;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Subscribe Now'; }
      }
    })
    .catch(() => {
      emailErr.textContent = 'Connection error. Please try again.';
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Subscribe Now'; }
    });
}

// Close panel on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSupportPanel();
});

window.openSupportPanel  = openSupportPanel;
window.closeSupportPanel = closeSupportPanel;
window.submitSupportForm = submitSupportForm;
