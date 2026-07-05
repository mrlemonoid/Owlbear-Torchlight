import{m,D as M,O as g,s as S,a as f,g as N,M as _,b as O,d as R,e as q,h as w,f as B,B as A,T as W}from"./engine-CaCssZoH.js";const F=document.querySelector("#app");let h=!1,t=m(M),p=0,C=null,L=null;function d(e){return Math.round(Number(e)*100)}function u(e,a,n,s,l,o,r=""){return`
    <label class="field" for="${e}">
      <span class="field__top"><span>${a}</span><strong id="${e}Value">${n}${r}</strong></span>
      <input id="${e}" class="native-range" type="range" min="${s}" max="${l}" step="${o}" value="${n}" data-setting="${e}" />
    </label>
  `}function x(e,a,n){return`
    <label class="check-field" for="${e}">
      <span>${a}</span>
      <input id="${e}" type="checkbox" ${n?"checked":""} data-setting="${e}" />
    </label>
  `}function k(e,a,n,s){var l;return`
    <div class="field style-field">
      <span class="field__top"><span>${a}</span><strong>${((l=s.find(o=>o.value===n))==null?void 0:l.label)??n}</strong></span>
      <div class="choice-grid" data-choice-group="${e}">
        ${s.map(o=>`
          <button
            type="button"
            class="choice-button ${o.value===n?"is-active":""}"
            data-setting="${e}"
            data-value="${o.value}"
          >${o.label}</button>
        `).join("")}
      </div>
    </div>
  `}function T(){F.innerHTML=`
    <section class="panel">
      <header class="hero">
        <div>
          <p class="eyebrow">Owlbear Rodeo</p>
          <h1>Torchlight</h1>
        </div>
        <div class="status ${h?"on":"off"}">${h?"LIVE":"OFF"}</div>
      </header>

      <section class="card flame-card">
        <div class="flame-preview" style="--flame: ${f(t.color)}; --pulse: ${t.intensity};">
          <div class="flame-preview__glow"></div>
          <svg viewBox="0 0 64 64" class="flame-preview__icon" aria-hidden="true">
            <path d="M32 8c5.5 7.1 2.4 11.2 8.5 17.2 3.9 3.8 6.4 8.2 6.4 14.4C46.9 51.2 39.8 58 32 58s-14.9-6.8-14.9-18.4c0-6.2 2.5-10.6 6.4-14.4C29.6 19.2 26.5 15.1 32 8Z"></path>
            <path d="M32 30.5c3.5 4.3 6.1 7.8 6.1 12.7 0 5-2.8 8.2-6.1 8.2s-6.1-3.2-6.1-8.2c0-4.9 2.6-8.4 6.1-12.7Z"></path>
          </svg>
        </div>
        <p class="muted center">Place this over torches, braziers, caged flames, windows, or magical lights. Choose a style, tweak the glow, and place it on the scene.</p>
      </section>

      <section class="card">
        <h2>Light Source</h2>
        <div class="actions-main three-actions">
          <button id="addLight" class="primary" type="button">Add Torch Light</button>
          <button id="addBeam" class="primary secondary-primary" type="button">Add Window / Beam Light</button>
          <button id="deleteLight" type="button">Delete Selected</button>
        </div>
        <p class="muted" id="selectionInfo">${p?`${p} Torchlight item selected.`:"No Torchlight item selected. The controls set the next light you add."}</p>
      </section>

      <section class="card compact">
        <h2 class="section-title">Settings</h2>
        ${t.sourceType==="beam"?`
          ${k("beamStyle","Beam Style",t.beamStyle,A)}
          ${u("beamLength","Beam Length",Math.round(t.beamLength),60,1800,10," px")}
          ${u("beamWidth","Beam Width",Math.round(t.beamWidth),20,900,10," px")}
          ${u("irregularity","Softness / Breakup",d(t.irregularity),0,100,1,"%")}
        `:`
          ${k("torchStyle","Torch Style",t.torchStyle,W)}
          ${u("radius","Radius",Math.round(t.radius),40,1400,10," px")}
          ${u("sourceRadius","Hot Core",Math.round(t.sourceRadius),1,400,1," px")}
          ${u("irregularity","Shape Irregularity",d(t.irregularity),0,100,1,"%")}
        `}
        ${u("intensity","Intensity",d(t.intensity),0,200,1,"%")}
        ${u("flicker","Flicker Amount",d(t.flicker),0,100,1,"%")}
        ${u("speed","Flicker Speed",Math.round(t.speed*100),10,400,5,"%")}
        ${u("markerOpacity","Marker Visibility",d(t.markerOpacity),0,100,1,"%")}
        <label class="field" for="color">
          <span class="field__top"><span>Light Color</span><strong>${f(t.color).toUpperCase()}</strong></span>
          <input id="color" class="color-input" type="color" value="${f(t.color)}" />
        </label>
        <label class="field" for="hotspotColor">
          <span class="field__top"><span>Hotspot Color</span><strong>${f(t.hotspotColor).toUpperCase()}</strong></span>
          <input id="hotspotColor" class="color-input" type="color" value="${f(t.hotspotColor)}" />
        </label>
        ${x("visualGlow",t.sourceType==="beam"?"Visible beam glow":"Visual glow on the map",t.visualGlow)}
        ${t.sourceType==="beam"?'<p class="muted small-note">Window / beam styles can simulate clean light, barred windows, grates, or cage shadows. Use Smoke & Spectre Create Torchlight on the selected source item if you also want fog reveal.</p>':`
          ${x("fogLight","Native Owlbear fog light / fog cut",t.fogLight)}
          <p class="muted small-note">Torch styles can now use hotspot color and irregular shapes. Keep Owlbear fog light off when Smoke & Spectre wall-aware light is needed.</p>
        `}
      </section>
    </section>
  `,U()}function y(e,a,n="range"){return e==="radius"?{radius:Number(a)}:e==="sourceRadius"?{sourceRadius:Number(a)}:e==="beamLength"?{beamLength:Number(a)}:e==="beamWidth"?{beamWidth:Number(a)}:e==="torchStyle"?{torchStyle:String(a)}:e==="beamStyle"?{beamStyle:String(a)}:e==="irregularity"?{irregularity:Number(a)/100}:e==="intensity"?{intensity:Number(a)/100}:e==="flicker"?{flicker:Number(a)/100}:e==="speed"?{speed:Number(a)/100}:e==="markerOpacity"?{markerOpacity:Number(a)/100}:e==="visualGlow"?{visualGlow:!!a}:e==="fogLight"?{fogLight:!!a}:e==="color"?{color:w(a)}:e==="hotspotColor"?{hotspotColor:w(a)}:{}}function b(e,a=!1){t=m({...t,...e}),window.clearTimeout(C);const n=async()=>{if(h){const s=await B(e);s>0&&(p=s),await S()}};a?n():C=window.setTimeout(n,40)}function I(e){const a=document.querySelector(`#${e}Value`);a&&(e==="radius"&&(a.textContent=`${Math.round(t.radius)} px`),e==="sourceRadius"&&(a.textContent=`${Math.round(t.sourceRadius)} px`),e==="beamLength"&&(a.textContent=`${Math.round(t.beamLength)} px`),e==="beamWidth"&&(a.textContent=`${Math.round(t.beamWidth)} px`),e==="irregularity"&&(a.textContent=`${d(t.irregularity)}%`),e==="intensity"&&(a.textContent=`${d(t.intensity)}%`),e==="flicker"&&(a.textContent=`${d(t.flicker)}%`),e==="speed"&&(a.textContent=`${Math.round(t.speed*100)}%`),e==="markerOpacity"&&(a.textContent=`${d(t.markerOpacity)}%`))}async function $(){var s,l,o;if(!h)return;const e=document.activeElement,a=(s=e==null?void 0:e.matches)==null?void 0:s.call(e,"input"),n=await N();if(p=n.length,n[0]&&(t=m(((o=(l=n[0].metadata)==null?void 0:l[_])==null?void 0:o.settings)??t)),!a)T();else{const r=document.querySelector("#selectionInfo");r&&(r.textContent=p?`${p} Torchlight item selected.`:"No Torchlight item selected. The controls set the next light you add.")}}function E(){window.clearTimeout(L),L=window.setTimeout(()=>void $(),60)}function U(){var e,a,n,s,l;(e=document.querySelector("#addLight"))==null||e.addEventListener("click",async()=>{h&&(await O(t),p=1,await g.notification.show("Torch light added."),await $())}),(a=document.querySelector("#addBeam"))==null||a.addEventListener("click",async()=>{h&&(await R(t),p=1,await g.notification.show("Window / beam light added."),await $())}),(n=document.querySelector("#deleteLight"))==null||n.addEventListener("click",async()=>{if(!h)return;const o=await q();p=0,await g.notification.show(o?"Selected Torchlight item deleted.":"Select a Torchlight item first.",o?"SUCCESS":"WARNING"),await $()}),document.querySelectorAll(".native-range[data-setting]").forEach(o=>{o.addEventListener("input",r=>{const i=r.currentTarget.dataset.setting,c=y(i,r.currentTarget.value);t=m({...t,...c}),I(i),b(c,!1)}),o.addEventListener("change",r=>{const i=r.currentTarget.dataset.setting;b(y(i,r.currentTarget.value),!0)})}),document.querySelectorAll(".check-field input[data-setting]").forEach(o=>{o.addEventListener("change",r=>{const i=r.currentTarget.dataset.setting,c=y(i,r.currentTarget.checked,"checkbox");b(c,!0),T()})}),document.querySelectorAll(".choice-button[data-setting]").forEach(o=>{o.addEventListener("click",r=>{const i=r.currentTarget.dataset.setting,c=r.currentTarget.dataset.value,v=y(i,c,"select");t=m({...t,...v}),b(v,!0),T()})}),(s=document.querySelector("#color"))==null||s.addEventListener("input",o=>{var c;const r=y("color",o.currentTarget.value);t=m({...t,...r});const i=(c=o.currentTarget.closest(".field"))==null?void 0:c.querySelector("strong");i&&(i.textContent=f(t.color).toUpperCase()),b(r,!1)}),(l=document.querySelector("#hotspotColor"))==null||l.addEventListener("input",o=>{var c;const r=y("hotspotColor",o.currentTarget.value);t=m({...t,...r});const i=(c=o.currentTarget.closest(".field"))==null?void 0:c.querySelector("strong");i&&(i.textContent=f(t.hotspotColor).toUpperCase()),b(r,!1)})}async function G(){T(),g.isAvailable&&g.onReady(async()=>{h=!0,await $(),await S(),g.player.onChange(()=>{E()}),g.scene.onReadyChange(async e=>{e&&(h=!0,await $(),await S())}),g.scene.items.onChange(()=>{S(),E()})})}G();
