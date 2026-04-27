/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2015 Adobe Systems Incorporated
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe Systems Incorporated and its suppliers,
* if any.  The intellectual and technical concepts contained
* herein are proprietary to Adobe Systems Incorporated and its
* suppliers and are protected by all applicable intellectual property laws,
* including trade secret and or copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe Systems Incorporated.
**************************************************************************/
(()=>{let e,t,i,n,s=!1,o=!1;const r=()=>{s&&(i?.messageAreaObserverHandler(),i?.imagePreviewerObserverHandler()),o&&(t?.addChatConvertToPDFTouchpoint?.(),t?.updateChatTouchpointBasedOnWidthAvailable?.())},c=new MutationObserver((()=>{if(c.takeRecords(),!chrome?.runtime?.id)return c.disconnect(),t?.removeAllAcrobatTouchPoint?.(),i?.removeAllTouchpoints?.(),e?.disconnectEventListeners?.(),s=!1,void(o=!1);r()})),a=()=>{if(document?.body)try{c.observe(document.body,{attributes:!0,attributeFilter:["class"],childList:!0,subtree:!0})}catch(e){}else setTimeout(a,500)},m=async()=>{[n,e,t,i]=await Promise.all([import(chrome.runtime.getURL("content_scripts/utils/util.js")),import(chrome.runtime.getURL("content_scripts/gemini/state.js")).then((e=>e.default)),import(chrome.runtime.getURL("content_scripts/gemini/gemini-chat-touchpoint-service.js")),import(chrome.runtime.getURL("content_scripts/express/gemini/gemini-express-touchpoint-service.js")).then((e=>e.geminiExpressTouchpointService))])};(async()=>{const[,t]=await Promise.all([m(),Promise.all([chrome.runtime.sendMessage({main_op:"gemini-express-init"}),chrome.runtime.sendMessage({main_op:"gemini-convert-to-pdf-init"})])]),c=t[0]??{},u=t[1]??{},p=c.enableGeminiPreviewExpressMenu||c.enableGeminiChatViewExpressMenu,l=u.enableGeminiConvertToPdfTouchpoint;(p||l)&&(s=p,o=l,n?.addFontToDocument(e),await(async(t,n,s,o)=>{o&&e&&(e.config=s),n&&i&&(i.applyExpressSelectors(t),await i.loadContentScripts())})(c,p,u,l),r(),a())})()})();