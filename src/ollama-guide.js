// Setup steps shown when the browser cannot use Ollama. Commands follow Ollama's FAQ (docs.ollama.com/faq) for each platform.
export const platforms=[['mac-app','Mac (Ollama app)'],['mac-brew','Mac (Homebrew service)'],['windows','Windows'],['linux','Linux (systemd service)']];
// Browser engine, for the rules each applies to an https page calling http://localhost: WebKit (Safari, and every iOS browser) blocks it as mixed content; Chromium asks for local network access first.
export function detectBrowser(nav=globalThis.navigator){const ua=String(nav?.userAgent||'');if(nav?.userAgentData?.brands?.some(b=>/Chromium|Chrome/.test(b.brand))||/Chrome\/|Chromium\/|Edg\//.test(ua)&&!/iPhone|iPad|iPod/.test(ua))return 'chromium';if(/Firefox\//.test(ua)&&!/iPhone|iPad|iPod/.test(ua))return 'firefox';if(/AppleWebKit\//.test(ua))return 'safari';return 'other';}
// Whether Chromium's local network permission for this site is 'granted', 'prompt' or 'denied' (null when the browser can't say).
export async function localNetworkPermission(nav=globalThis.navigator){for(const name of ['loopback-network','local-network-access']){try{return (await nav.permissions.query({name})).state;}catch{}}return null;}
export function detectPlatform(nav=globalThis.navigator){const p=String(nav?.userAgentData?.platform||nav?.platform||nav?.userAgent||'');return /mac/i.test(p)?'mac-app':/win/i.test(p)?'windows':/linux|x11|cros/i.test(p)?'linux':'mac-app';}
const again={text:'Then choose Fetch models again.'};
const allowPrompt={text:'If your browser asks to let this site access devices or apps on your local network, choose Allow. Ollama is one of those apps.'};
const otherBrowsers='Chrome, Edge or Firefox';
const allow=origin=>({
  'mac-app':[{text:'Allow this site. In Terminal, run:',command:`launchctl setenv OLLAMA_ORIGINS "${origin}"`}],
  'mac-brew':[{text:'Allow this site. In Terminal, run:',command:`launchctl setenv OLLAMA_ORIGINS "${origin}"`}],
  windows:[{text:'Allow this site. In PowerShell, run:',command:`setx OLLAMA_ORIGINS "${origin}"`}],
  linux:[{text:'Allow this site. Open the service settings:',command:'sudo systemctl edit ollama.service'},{text:'Add these lines in the editor, then save and close it:',command:`[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"`},{text:'Reload the service settings:',command:'sudo systemctl daemon-reload'}],
});
export function ollamaGuide(problem,platform,origin,browser='other'){
  if(problem==='safari')return {title:'Safari can’t connect to Ollama from this site',intro:'Safari blocks secure (https) pages from reaching apps on your computer over plain http, and Ollama only speaks plain http. Ollama may be running fine. Safari stops the request before it gets there.',platformless:true,steps:[{text:`Open this page in ${otherBrowsers} on the same computer:`,command:origin},{text:'Connect Ollama there. If the browser asks to let this site access your local network, choose Allow.'},again],notes:['Cloud providers work in Safari as usual. Only local Ollama is affected.','Other WebKit browsers on a Mac behave like Safari. On an iPhone or iPad every browser uses Safari’s engine, and localhost is the device itself, not your computer.']};
  if(problem==='blocked')return {title:'Your browser blocked access to Ollama',intro:'This site isn’t allowed to reach apps on this computer, so the browser stopped the request before it got to Ollama.',platformless:true,steps:[{text:'Click the site settings icon to the left of the address bar.'},{text:'Set local network access (and access to apps on this device, if listed) to Allow, then reload the page.'},again],notes:['Ollama must also allow this site in OLLAMA_ORIGINS. If it doesn’t, this guide shows those steps next.']};
  const ask=browser==='chromium'?[allowPrompt]:[];
  if(problem==='offline')return {title:'Ollama isn’t running on this device',intro:'This page connects to Ollama on the same computer as this browser. A phone’s localhost is the phone, not your computer.',steps:[{text:'Not installed yet? Download it for your computer:',link:{href:'https://ollama.com/download',label:'ollama.com/download'}},...allow(origin)[platform],...{
    'mac-app':[{text:'Open Ollama from your Applications folder and wait for its menu-bar icon.'}],
    'mac-brew':[{text:'In Terminal, start the service:',command:'brew services start ollama'}],
    windows:[{text:'Start Ollama from the Start menu and wait for its taskbar icon.'}],
    linux:[{text:'In a terminal, start the service:',command:'sudo systemctl start ollama'}],
  }[platform],{text:'Download a model to chat with, for example:',command:'ollama pull qwen3.5:4b'},...ask,again],notes:[`Allow this exact address: ${origin}. Already allow other sites? Put them all in one value, separated by commas.`,...(platform.startsWith('mac')?['launchctl setenv lasts until your Mac restarts. Run it again after a restart.']:[])]};
  return {title:'Ollama is running but refusing this site',intro:`Ollama only answers web pages it has been told to trust. Allow this exact address: ${origin}`,steps:[...{
    'mac-app':[{text:'In Terminal, run:',command:`launchctl setenv OLLAMA_ORIGINS "${origin}"`},{text:'Quit Ollama from its menu-bar icon, then open it again.'}],
    'mac-brew':[{text:'In Terminal, run:',command:`launchctl setenv OLLAMA_ORIGINS "${origin}"`},{text:'Restart the service:',command:'brew services restart ollama'}],
    windows:[{text:'Quit Ollama from its taskbar icon.'},{text:'In PowerShell, run:',command:`setx OLLAMA_ORIGINS "${origin}"`},{text:'Start Ollama again from the Start menu.'}],
    linux:[{text:'Open the service settings:',command:'sudo systemctl edit ollama.service'},{text:'Add these lines in the editor, then save and close it:',command:`[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"`},{text:'Reload and restart Ollama:',command:'sudo systemctl daemon-reload && sudo systemctl restart ollama'}],
  }[platform],...ask,again],notes:['Already allow other sites? Put them all in one value, separated by commas.',...(platform.startsWith('mac')?['launchctl setenv lasts until your Mac restarts. Run it again after a restart.']:[])]};
}
