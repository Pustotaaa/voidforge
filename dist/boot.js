buildModulePalette();
const continued=load();
resetPresentation();
if(continued&&['flying','replacement','default'].includes(s.launch.phase))restoreDeathRecord();
try{autoAim=localStorage.getItem('voidforge-autoaim')!=='false';setReducedMotion(localStorage.getItem('voidforge-low-motion')==='true'||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);}catch{}
setAutoAim(autoAim);renderPauseButton();resize();
initLaunch(continued);
sharedFlight?.initialize();
requestAnimationFrame(loop);
setInterval(()=>{if(!s.dead&&modal!=='builder')save(false);},15000);
