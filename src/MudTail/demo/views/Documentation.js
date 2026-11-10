// Vanilla JS Storyboard & Framework Documentation Site
import { getIconSvg } from 'mudtail';
import { createMudButton } from 'mudtail';
import { MudDialog } from 'mudtail';
import { MudAccordion } from 'mudtail';
import { createAutocomplete } from 'mudtail';
import { showToast } from 'mudtail';

export function createDocumentationView() {
  const container = document.createElement('div');
  container.className = 'mud-doc-view';
  container.style.maxWidth = '1200px';
  container.style.margin = '0 auto';
  container.style.padding = '24px 20px';

  container.innerHTML = `
    <!-- Hero Banner -->
    <div class="mud-paper mud-elevation-2" style="padding:32px;margin-bottom:32px;background:linear-gradient(135deg, rgba(89,74,226,0.1) 0%, rgba(255,64,129,0.05) 100%);border:1px solid rgba(89,74,226,0.2);">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="font-size:0.75rem;padding:4px 10px;border-radius:20px;background:var(--mud-palette-primary);color:#fff;font-weight:700;">VANILLA JS + SCSS + GSAP</span>
        <span style="font-size:0.75rem;color:var(--mud-palette-text-secondary);">Production-Grade Material UI Architecture</span>
      </div>
      <h1 class="mud-typography mud-typography-h4" style="font-weight:800;margin-bottom:8px;">MudTail Material Component Framework</h1>
      <p class="mud-typography mud-typography-body1" style="max-width:760px;margin-bottom:20px;color:var(--mud-palette-text-secondary);">
        Complete Material UI component system designed after MudBlazor, crafted with pure JavaScript modules (no React, Vue, or C# runtime dependencies), modern SCSS styling, and GSAP hardware-accelerated animations.
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium" id="doc-btn-try-dialog">
          ${getIconSvg('sparkles', 16)} Open Interactive Dialog
        </button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-surface mud-button-medium" id="doc-btn-toast">
          ${getIconSvg('bell', 16)} Trigger GSAP Toast
        </button>
      </div>
    </div>

    <!-- Component Sandboxes Grid -->
    <div style="display:flex;flex-direction:column;gap:36px;">

      <!-- Section 1: Buttons & Ripples -->
      <section class="mud-paper mud-elevation-1" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 class="mud-typography mud-typography-h6">1. MudButton &amp; GSAP Ripple</h3>
            <p class="mud-typography mud-typography-body2">Filled, outlined, text, and circular icon buttons with expanding ripples</p>
          </div>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.06);font-family:monospace;">_buttons.scss</span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px;" id="doc-buttons-demo"></div>

        <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:4px;font-size:0.75rem;overflow-x:auto;">
&lt;!-- HTML / Vanilla JS Usage --&gt;
&lt;button class="mud-button-root mud-button-filled mud-button-primary mud-button-medium"&gt;Filled Primary&lt;/button&gt;
&lt;button class="mud-button-root mud-button-outlined mud-button-secondary mud-button-medium"&gt;Outlined Secondary&lt;/button&gt;
        </pre>
      </section>

      <!-- Section 2: MudPaper & Elevation -->
      <section class="mud-paper mud-elevation-1" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 class="mud-typography mud-typography-h6">2. MudPaper &amp; Elevation Shadows (0 to 24)</h3>
            <p class="mud-typography mud-typography-body2">Material surface elevations calibrated according to Material Design 3 guidelines</p>
          </div>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.06);font-family:monospace;">_elevation.scss</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:16px;margin-bottom:16px;">
          <div class="mud-paper mud-elevation-0" style="padding:16px;text-align:center;border:1px solid var(--mud-palette-lines-default);">Elevation 0</div>
          <div class="mud-paper mud-elevation-1" style="padding:16px;text-align:center;">Elevation 1</div>
          <div class="mud-paper mud-elevation-2" style="padding:16px;text-align:center;">Elevation 2</div>
          <div class="mud-paper mud-elevation-4" style="padding:16px;text-align:center;">Elevation 4</div>
          <div class="mud-paper mud-elevation-8" style="padding:16px;text-align:center;">Elevation 8</div>
          <div class="mud-paper mud-elevation-16" style="padding:16px;text-align:center;">Elevation 16</div>
        </div>
      </section>

      <!-- Section 3: MudAccordion -->
      <section class="mud-paper mud-elevation-1" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 class="mud-typography mud-typography-h6">3. MudAccordion &amp; Expansion Panels</h3>
            <p class="mud-typography mud-typography-body2">Smooth GSAP height animations with single or multi-expand modes</p>
          </div>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.06);font-family:monospace;">_accordion.scss</span>
        </div>

        <div id="doc-accordion-slot" style="margin-bottom:16px;"></div>
      </section>

      <!-- Section 4: MudAutocomplete -->
      <section class="mud-paper mud-elevation-1" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 class="mud-typography mud-typography-h6">4. MudAutocomplete Filtered Dropdown</h3>
            <p class="mud-typography mud-typography-body2">Keyboard arrow navigation (<kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd>), search highlighting, and clear action</p>
          </div>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.06);font-family:monospace;">_autocomplete.scss</span>
        </div>

        <div id="doc-autocomplete-slot" style="max-width:440px;margin-bottom:16px;"></div>
      </section>

      <!-- Section 5: Border Radius Utilities -->
      <section class="mud-paper mud-elevation-1" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 class="mud-typography mud-typography-h6">5. Rounded Border Utility Classes</h3>
            <p class="mud-typography mud-typography-body2">Classes from .mud-rounded-0 up to .mud-rounded-full, plus directional classes</p>
          </div>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.06);font-family:monospace;">_rounded.scss</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:12px;">
          <div class="mud-rounded-0" style="padding:14px;background:rgba(89,74,226,0.1);border:1px solid var(--mud-palette-primary);text-align:center;font-size:0.75rem;font-weight:600;">.mud-rounded-0<br>(0px Sharp)</div>
          <div class="mud-rounded-sm" style="padding:14px;background:rgba(89,74,226,0.1);border:1px solid var(--mud-palette-primary);text-align:center;font-size:0.75rem;font-weight:600;">.mud-rounded-sm<br>(2px Subtle)</div>
          <div class="mud-rounded-base" style="padding:14px;background:rgba(89,74,226,0.1);border:1px solid var(--mud-palette-primary);text-align:center;font-size:0.75rem;font-weight:600;">.mud-rounded-base<br>(4px Standard)</div>
          <div class="mud-rounded-lg" style="padding:14px;background:rgba(89,74,226,0.1);border:1px solid var(--mud-palette-primary);text-align:center;font-size:0.75rem;font-weight:600;">.mud-rounded-lg<br>(8px Elevated)</div>
          <div class="mud-rounded-2xl" style="padding:14px;background:rgba(89,74,226,0.1);border:1px solid var(--mud-palette-primary);text-align:center;font-size:0.75rem;font-weight:600;">.mud-rounded-2xl<br>(16px Soft)</div>
          <div class="mud-rounded-full" style="padding:14px;background:rgba(89,74,226,0.1);border:1px solid var(--mud-palette-primary);text-align:center;font-size:0.75rem;font-weight:600;">.mud-rounded-full<br>(Pill)</div>
        </div>
      </section>

    </div>
  `;

  // Demo buttons
  const buttonsDemo = container.querySelector('#doc-buttons-demo');
  buttonsDemo.appendChild(
    createMudButton({ text: 'Primary Filled', variant: 'filled', color: 'primary', icon: getIconSvg('sparkles', 16) })
  );
  buttonsDemo.appendChild(
    createMudButton({ text: 'Secondary Filled', variant: 'filled', color: 'secondary' })
  );
  buttonsDemo.appendChild(
    createMudButton({ text: 'Outlined', variant: 'outlined', color: 'primary' })
  );
  buttonsDemo.appendChild(
    createMudButton({ text: 'Text Button', variant: 'text', color: 'primary' })
  );
  buttonsDemo.appendChild(
    createMudButton({ text: 'Error Button', variant: 'filled', color: 'error' })
  );

  // Accordion demo
  const accordion = new MudAccordion({
    panels: [
      {
        id: 'p1',
        title: 'How does SCSS compilation work with Vite in Node.js?',
        icon: getIconSvg('terminal', 16),
        content: 'Vite uses the modern sass compiler API natively. Any changes to .scss modules are preprocessed instantly with zero build latency.',
        expanded: true,
      },
      {
        id: 'p2',
        title: 'How does GSAP accelerate UI transitions?',
        icon: getIconSvg('sparkles', 16),
        content: 'GSAP directly optimizes CSS transforms and opacity via requestAnimationFrame, ensuring a solid 60 FPS across all devices and browsers without layout thrashing.',
        expanded: false,
      },
      {
        id: 'p3',
        title: 'Can these SCSS files be exported to any external frontend?',
        icon: getIconSvg('download', 16),
        content: 'Yes! The entire SCSS codebase and compiled CSS tokens can be copied or downloaded directly via the Theme & Radius Drawer.',
        expanded: false,
      },
    ],
  });
  container.querySelector('#doc-accordion-slot').appendChild(accordion.getElement());

  // Autocomplete demo
  const ac = createAutocomplete({
    label: 'Framework Component Selector',
    placeholder: 'Try typing "drawer", "tabs", or "dock"...',
    items: ['MudButton', 'MudPaper', 'MudCard', 'MudDialog', 'MudDrawer', 'MudTabs', 'MudAppBar', 'MudAccordion', 'MudAutocomplete', 'VSDockLayout'],
    onSelect: (item) => {
      showToast(`Selected component: ${item}`, 'info');
    },
  });
  container.querySelector('#doc-autocomplete-slot').appendChild(ac);

  // Dialog trigger
  const dialog = new MudDialog({
    title: 'MudDialog Interactive Modal',
    content: `
      <p style="margin-bottom:12px;">This dialog is rendered purely in Vanilla JavaScript and animated via <strong>GSAP</strong> with a blurred backdrop.</p>
      <div style="background:rgba(89,74,226,0.08);padding:12px;border-radius:4px;border-left:3px solid var(--mud-palette-primary);font-size:0.8125rem;">
        Zero React or Vue dependencies. Pure ES module execution.
      </div>
    `,
    actions: [
      {
        label: 'Close Modal',
        variant: 'filled',
        color: 'primary',
        onClick: (e, d) => d.close(),
      },
    ],
  });

  container.querySelector('#doc-btn-try-dialog').addEventListener('click', () => {
    dialog.open();
  });

  container.querySelector('#doc-btn-toast').addEventListener('click', () => {
    showToast('GSAP Floating Notification Triggered!', 'success');
  });

  return container;
}
