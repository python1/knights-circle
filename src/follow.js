// Chat-style following for a scrolling transcript: stay on the newest text while a turn streams, unless the reader scrolls up to read.
export const atBottom=(box,slack=40)=>box.scrollHeight-box.scrollTop-box.clientHeight<=slack;
export function follow(box,{onChange=()=>{},reduceMotion=()=>false}={}){
 let following=true,jumping=false;
 const set=v=>{if(v!==following){following=v;onChange(v);}};
 const toEnd=smooth=>box.scrollTo({top:box.scrollHeight,behavior:smooth&&!reduceMotion()?'smooth':'auto'});
 // Scrolling up stops following; coming back to the bottom resumes it. A smooth jump ignores its own in-between positions.
 box.addEventListener('scroll',()=>{const end=atBottom(box);if(jumping){if(!end)return;jumping=false;}set(end);},{passive:true});
 for(const type of ['wheel','touchstart','keydown','pointerdown'])box.addEventListener(type,()=>{jumping=false;},{passive:true});
 return {
  get following(){return following;},
  // After the transcript changes: keep up with it when following; otherwise leave the reader where they are.
  update(){if(following)toEnd(false);},
  // Back to the newest text and following again (Jump to latest, a new room, or your own message).
  jump(smooth=true){jumping=smooth&&!reduceMotion();set(true);toEnd(smooth);},
 };
}
