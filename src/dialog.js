// Modal dialogs: Tab stays inside while open, Esc means the safe choice, and focus goes back to where it was (or a sensible place if that is gone).
const focusable='a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
export function tabbable(dialog){return [...dialog.querySelectorAll(focusable)].filter(el=>!el.disabled&&!el.closest('[hidden]')&&el.getClientRects().length);}
// Where Tab or Shift+Tab should go next, keeping focus inside; null leaves the browser's own order.
export function trapTarget(items,active,back){if(!items.length)return null;const first=items[0],last=items.at(-1),inside=items.includes(active);if(back)return !inside||active===first?last:null;return !inside||active===last?first:null;}
export function openModal(dialog,{cancelValue='stay',fallback=()=>null}={}){
 const before=document.activeElement;dialog.returnValue='';
 const onKey=e=>{if(e.key!=='Tab')return;const items=tabbable(dialog),next=trapTarget(items,document.activeElement,e.shiftKey);if(!items.length)e.preventDefault();else if(next){e.preventDefault();next.focus();}};
 const onCancel=()=>{dialog.returnValue=cancelValue;};
 dialog.addEventListener('keydown',onKey);dialog.addEventListener('cancel',onCancel);
 // After whatever the choice does (it may remove the button that opened the dialog), put focus back.
 dialog.addEventListener('close',()=>{dialog.removeEventListener('keydown',onKey);dialog.removeEventListener('cancel',onCancel);setTimeout(()=>{const usable=el=>el&&el.isConnected&&!el.disabled&&el.getClientRects().length&&!el.closest('[hidden]');const target=usable(before)?before:fallback();if(usable(target))target.focus();});},{once:true});
 dialog.showModal();
}
