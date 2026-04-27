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
window.overrideHTMLForConvertHTMLToPDFOp=async e=>{try{const t=await new Promise((e=>{chrome.runtime.sendMessage({main_op:"get-gemini-html-to-pdf-config"},(t=>{e(t??null)}))}));(t?.elementsToRemove||t?.pdfCSS||t?.accountDetails)&&function(e,t){e.querySelectorAll("style").forEach((e=>e.remove())),e.querySelectorAll("[style]").forEach((e=>e.removeAttribute("style"))),(t.elementsToRemove||[]).forEach((t=>{try{e.querySelectorAll(t).forEach((e=>e.remove()))}catch(e){}}));const o=t.accountDetails?e.querySelector(t.accountDetails)?.content?.trim():null;o&&e.querySelectorAll("div").forEach((e=>{e.textContent?.trim()===o&&e.parentElement?.closest("div")?.remove()}));const r=e.createElement("style");r.setAttribute("data-pdf-print","gemini-override"),r.textContent=t.pdfCSS,e.head.appendChild(r)}(e,t)}catch(e){}};