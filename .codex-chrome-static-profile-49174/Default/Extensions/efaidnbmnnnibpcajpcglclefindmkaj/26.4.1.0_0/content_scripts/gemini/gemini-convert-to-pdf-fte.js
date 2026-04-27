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
const GEMINI_CONVERT_TO_PDF_TOUCHPOINT_CONTAINER_CLASS="gemini-convert-to-pdf-touchpoint-container",GEMINI_FTE_STATE_STORAGE_KEY="acrobat-gemini-convert-to-pdf-fte",GEMINI_CONVERT_TO_PDF_FTE_CONTAINER_CLASS="acrobat-fte-tooltip-container";class GeminiConvertToPdfFte{id="geminiconverttopdffte";timeout=2e3;static GEMINI_DOMAINS=["gemini.google.com"];constructor(){const t=window.location.hostname;if(!GeminiConvertToPdfFte.GEMINI_DOMAINS.some((e=>t.includes(e))))return this.isEligible=async()=>!1,void(this.render=async()=>{});this.initPromise=this.loadServices()}async loadServices(){[this.fteUtils,this.geminiConvertToPdfFteService]=await Promise.all([import(chrome.runtime.getURL("content_scripts/utils/fte-utils.js")),import(chrome.runtime.getURL("content_scripts/gemini/gemini-convert-to-pdf-fte-service.js"))])}async render(){await(this.geminiConvertToPdfFteService?.addFte?.())}async isEligible(){const t=await chrome.runtime.sendMessage({main_op:"gemini-convert-to-pdf-init"});if(!t?.enableGeminiConvertToPdfTouchpoint||!t?.enableFte)return!1;await this.initPromise;const e=document.getElementsByClassName("gemini-convert-to-pdf-touchpoint-container");if(!e?.length)return!1;if(document.getElementsByClassName("acrobat-fte-tooltip-container").length>0)return!1;const i=await this.fteUtils.initFteStateAndConfig(GEMINI_FTE_STATE_STORAGE_KEY);return this.fteUtils.shouldShowFteTooltip(t.fteConfig,i,t.enableFte)}}window.GeminiConvertToPdfFte=GeminiConvertToPdfFte;