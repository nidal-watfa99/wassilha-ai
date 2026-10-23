/* Lightweight inline SVG icon set (no external icon library). */
import React from "react";

const I = (d, extra = {}) => (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d={d} />
    {extra.extra}
  </svg>
);

export const IconHome = I("M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V10.5z");
export const IconUsers = I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75");
export const IconChat = I("M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z");
export const IconPhone = I("M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z");
export const IconVideo = I("M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z");
export const IconSpark = I("M12 2l1.9 5.7L19.6 9.6l-5.7 1.9L12 17.2l-1.9-5.7L4.4 9.6l5.7-1.9L12 2zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z");
export const IconCheck = I("M20 6L9 17l-5-5");
export const IconSquare = I("M3 3h18v18H3z");
export const IconCalendar = I("M3 5h18v16H3V5zm0 6h18M8 3v4m8-4v4");
export const IconDoc = I("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6");
export const IconChart = I("M3 3v18h18M7 15v3m4-7v7m4-11v11");
export const IconBox = I("M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v10");
export const IconCalc = I("M4 2h16v20H4V2zm4 4h8v4H8V6zm0 8h2v2H8v-2zm6 0h2v2h-2v-2zM8 18h2v2H8v-2zm6 0h2v2h-2v-2z");
export const IconGear = I("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 2h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z");
export const IconInfo = I("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14v.5m0 3.5v5");
export const IconSearch = I("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35");
export const IconPlus = I("M12 5v14M5 12h14");
export const IconTrash = I("M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6");
export const IconEdit = I("M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z");
export const IconSend = I("M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z");
export const IconMic = I("M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4");
export const IconStop = I("M6 6h12v12H6z");
export const IconPaperclip = I("M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48");
export const IconMenu = I("M3 6h18M3 12h18M3 18h18");
export const IconX = I("M18 6L6 18M6 6l12 12");
export const IconLogout = I("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9");
export const IconAlert = I("M12 9v4m0 4h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z");
export const IconDown = I("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3");

export const IconMap = I("M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z");
export const IconBell = I("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0");
export const IconId = I("M3 5h18v14H3V5zm5 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 6c0-2 1.5-3 3-3s3 1 3 3m4-8h5m-5 4h5");
export const IconInvoice = I("M6 2h12v20l-3-2-3 2-3-2-3 2V2zM9 7h6M9 11h6M9 15h3");
