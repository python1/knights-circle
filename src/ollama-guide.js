// Setup steps shown when the browser cannot use Ollama. Commands follow Ollama's FAQ (docs.ollama.com/faq) for each platform.
export const platforms=[['mac-app','Mac (Ollama app)'],['mac-brew','Mac (Homebrew service)'],['windows','Windows'],['linux','Linux (systemd service)']];
export function detectPlatform(nav=globalThis.navigator){const p=String(nav?.userAgentData?.platform||nav?.platform||nav?.userAgent||'');return /mac/i.test(p)?'mac-app':/win/i.test(p)?'windows':/linux|x11|cros/i.test(p)?'linux':'mac-app';}
const again={text:'Then choose Fetch models again.'};
export function ollamaGuide(problem,platform,origin){
  if(problem==='offline')return {title:'Ollama isn’t running on this device',intro:'This page connects to Ollama on the same computer as this browser. A phone’s localhost is the phone, not your computer.',steps:[...{
    'mac-app':[{text:'Open Ollama from your Applications folder and wait for its menu-bar icon.'}],
    'mac-brew':[{text:'In Terminal, start the service:',command:'brew services start ollama'}],
    windows:[{text:'Start Ollama from the Start menu and wait for its taskbar icon.'}],
    linux:[{text:'In a terminal, start the service:',command:'sudo systemctl start ollama'}],
  }[platform],again],notes:[]};
  return {title:'Ollama is running but refusing this site',intro:`Ollama only answers web pages it has been told to trust. Allow this exact address: ${origin}`,steps:[...{
    'mac-app':[{text:'In Terminal, run:',command:`launchctl setenv OLLAMA_ORIGINS "${origin}"`},{text:'Quit Ollama from its menu-bar icon, then open it again.'}],
    'mac-brew':[{text:'In Terminal, run:',command:`launchctl setenv OLLAMA_ORIGINS "${origin}"`},{text:'Restart the service:',command:'brew services restart ollama'}],
    windows:[{text:'Quit Ollama from its taskbar icon.'},{text:'In PowerShell, run:',command:`setx OLLAMA_ORIGINS "${origin}"`},{text:'Start Ollama again from the Start menu.'}],
    linux:[{text:'Open the service settings:',command:'sudo systemctl edit ollama.service'},{text:'Add these lines in the editor, then save and close it:',command:`[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"`},{text:'Reload and restart Ollama:',command:'sudo systemctl daemon-reload && sudo systemctl restart ollama'}],
  }[platform],again],notes:['Already allow other sites? Put them all in one value, separated by commas.',...(platform.startsWith('mac')?['launchctl setenv lasts until your Mac restarts. Run it again after a restart.']:[])]};
}
