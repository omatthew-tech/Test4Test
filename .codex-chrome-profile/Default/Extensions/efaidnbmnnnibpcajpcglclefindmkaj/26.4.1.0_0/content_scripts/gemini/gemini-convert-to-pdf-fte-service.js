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
import{sendErrorLog,sendAnalytics}from"../utils/util.js";import{createFteTooltip,addFteCloseButtonListener,updateFteToolTipCoolDown,acrobatTouchPointClicked}from"../utils/fte-utils.js";import state from"./state.js";const GEMINI_CONVERT_TO_PDF_FTE_STORAGE_KEY="acrobat-gemini-convert-to-pdf-fte",FTE_TYPE="geminiChatConvertToPdf",FTE_TOOLTIP_CONTAINER_CLASS="acrobat-fte-tooltip-container";export const GEMINI_CONVERT_TO_PDF_TOUCHPOINT_CONTAINER_CLASS="gemini-convert-to-pdf-touchpoint-container";const SOURCE="gemini_chrome",WORKFLOW="convert_to_pdf_chat";export const removeFteTooltip=()=>{const t=document.getElementsByClassName(FTE_TOOLTIP_CONTAINER_CLASS);if(t.length>0){const e=t[0];e.clickOutsideHandler&&document.removeEventListener("click",e.clickOutsideHandler),e.remove()}};const attachGeminiConvertToPdfFteListeners=t=>{const e=()=>{removeFteTooltip(),t.clickOutsideHandler&&document.removeEventListener("click",t.clickOutsideHandler)};t.clickOutsideHandler=o=>{t.contains(o.target)||(e(),sendAnalytics([["DCBrowserExt:DirectVerb:Fte:Dismissed",{source:SOURCE,workflow:WORKFLOW}]]))},addFteCloseButtonListener(t,{fteType:FTE_TYPE,onClose:()=>{e(),sendAnalytics([["DCBrowserExt:DirectVerb:Fte:Closed",{source:SOURCE,workflow:WORKFLOW}]])},sendErrorLog:sendErrorLog})};export const addFte=async()=>{try{const t=document.getElementsByClassName("gemini-convert-to-pdf-touchpoint-container")[0];if(!t)return;const e=state?.config,o=createFteTooltip({title:e.geminiChatFteTitle,description:e.geminiChatFteDescription,button:e.closeButton},FTE_TYPE);attachGeminiConvertToPdfFteListeners(o),document.addEventListener("click",o.clickOutsideHandler,{once:!0}),t.appendChild(o),sendAnalytics([["DCBrowserExt:DirectVerb:Fte:Shown",{source:SOURCE,workflow:WORKFLOW}]]),await updateFteToolTipCoolDown(e.fteConfig,"acrobat-gemini-convert-to-pdf-fte")}catch{sendErrorLog("GeminiConvertToPdfFte","Failure in adding FTE to Gemini convert-to-PDF touchpoint")}};export const markGeminiConvertToPdfFteConsumed=()=>(removeFteTooltip(),acrobatTouchPointClicked("acrobat-gemini-convert-to-pdf-fte"));