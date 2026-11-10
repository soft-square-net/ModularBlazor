// Vanilla JS Authentication Forms (Login, Register, 2FA)
import { getIconSvg } from 'mudtail';
import { createMudButton } from 'mudtail';
import { showToast } from 'mudtail';

export function createAuthInputs() {
  const container = document.createElement('div');
  container.className = 'mud-paper mud-elevation-2';
  container.style.padding = '24px';
  container.style.maxWidth = '460px';
  container.style.width = '100%';
  container.style.margin = '0 auto';

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:20px;">
      <h3 class="mud-typography mud-typography-h5" style="margin-bottom:6px;">Sign In to MudTail</h3>
      <p class="mud-typography mud-typography-body2">Material UI authentication form with real-time validation</p>
    </div>

    <form id="auth-form" onsubmit="return false;">
      <div class="mud-input-control">
        <label class="mud-input-label">
          ${getIconSvg('mail', 14)} Email Address
        </label>
        <div class="mud-input-wrapper" id="email-wrapper">
          <span class="mud-input-adornment-start">${getIconSvg('mail', 18)}</span>
          <input type="email" id="auth-email" class="mud-input-slot" placeholder="developer@example.com" required />
        </div>
        <div class="mud-input-helper-text" id="email-helper">Enter a valid work or personal email</div>
      </div>

      <div class="mud-input-control">
        <label class="mud-input-label">
          ${getIconSvg('lock', 14)} Password
        </label>
        <div class="mud-input-wrapper" id="pass-wrapper">
          <span class="mud-input-adornment-start">${getIconSvg('lock', 18)}</span>
          <input type="password" id="auth-pass" class="mud-input-slot" placeholder="••••••••••••" required />
          <button type="button" id="toggle-pass-btn" class="mud-input-adornment-end" style="background:transparent;border:none;cursor:pointer;">
            ${getIconSvg('eye', 18)}
          </button>
        </div>
        <div class="mud-input-helper-text" id="pass-helper">Must be at least 8 characters</div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <label class="mud-checkbox">
          <input type="checkbox" id="auth-remember" checked />
          <span>Remember me for 30 days</span>
        </label>
        <a href="#forgot" style="font-size:0.8125rem;color:var(--mud-palette-primary);text-decoration:none;font-weight:500;">Forgot password?</a>
      </div>

      <div id="auth-btn-slot" style="margin-bottom:16px;"></div>

      <div style="display:flex;align-items:center;gap:12px;margin:16px 0;color:var(--mud-palette-text-secondary);font-size:0.75rem;">
        <div style="flex:1;height:1px;background:var(--mud-palette-lines-default);"></div>
        <span>OR CONTINUE WITH</span>
        <div style="flex:1;height:1px;background:var(--mud-palette-lines-default);"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button type="button" class="mud-button-root mud-button-outlined mud-button-surface mud-button-medium" style="width:100%;">
          ${getIconSvg('git', 16)} GitHub
        </button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-surface mud-button-medium" style="width:100%;">
          ${getIconSvg('shield', 16)} Single Sign-On
        </button>
      </div>
    </form>
  `;

  // Toggle password visibility
  const passInput = container.querySelector('#auth-pass');
  const togglePassBtn = container.querySelector('#toggle-pass-btn');
  let showPass = false;
  togglePassBtn.addEventListener('click', () => {
    showPass = !showPass;
    passInput.type = showPass ? 'text' : 'password';
    togglePassBtn.innerHTML = showPass ? getIconSvg('eyeOff', 18) : getIconSvg('eye', 18);
  });

  // Submit button
  const submitBtn = createMudButton({
    text: 'Sign In to Dashboard',
    variant: 'filled',
    color: 'primary',
    size: 'large',
    icon: getIconSvg('shield', 18),
    className: 'w-full',
    onClick: () => {
      const email = container.querySelector('#auth-email').value;
      const pass = passInput.value;
      const emailWrapper = container.querySelector('#email-wrapper');
      const emailHelper = container.querySelector('#email-helper');

      if (!email.includes('@') || !email.includes('.')) {
        emailWrapper.classList.add('mud-input-error');
        emailHelper.classList.add('error');
        emailHelper.innerText = 'Please provide a valid email format';
        return;
      } else {
        emailWrapper.classList.remove('mud-input-error');
        emailHelper.classList.remove('error');
        emailHelper.innerText = 'Email validated';
      }

      if (pass.length < 6) {
        showToast('Password is too short (min 6 chars)', 'error');
        return;
      }

      showToast(`Authenticated successfully as ${email}`, 'success');
    },
  });

  submitBtn.style.width = '100%';
  container.querySelector('#auth-btn-slot').appendChild(submitBtn);

  return container;
}
