/* @flow */

// $FlowIgnore
import Mustache from 'mustache';
import * as detectDiff from 'x-img-diff-js';
import fs from 'fs';
import mkdirp from 'make-dir'; // $FlowIgnore
import path from 'path';
// $FlowIgnore
import * as xmlBuilder from 'xmlbuilder2';

export type ReportParams = {
  passedItems: string[],
  failedItems: string[],
  newItems: string[],
  deletedItems: string[],
  expectedItems: string[],
  actualItems: string[],
  diffItems: string[],
  diffDetails?: Object,
  json: string,
  actualDir: string,
  expectedDir: string,
  diffDir: string,
  report: string,
  junitReport: string,
  extendedErrors: boolean,
  urlPrefix: string,
  enableClientAdditionalDetection: boolean,
  fromJSON?: boolean,
};

const loadFaviconAsDataURL = type => {
  // Create simple 16x16 favicon as base64 data URL
  const colors = {
    success: '#4CAF50', // Green
    failure: '#F44336'  // Red
  };
  
  const color = colors[type] || colors.success;
  
  // Simple SVG favicon converted to base64
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="7" fill="${color}" stroke="#fff" stroke-width="1"/>
    <text x="8" y="12" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">
      ${type === 'failure' ? '✗' : '✓'}
    </text>
  </svg>`;
  
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
};

const encodeFilePath = filePath => {
  return filePath
    .split(path.sep)
    .map(p => encodeURIComponent(p))
    .join(path.sep);
};

const createFallbackCSS = () => {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      scroll-behavior: smooth;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      overflow: hidden;
      animation: slideIn 0.6s ease-out;
      will-change: transform;
      transform: translateZ(0);
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .header {
      background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
      color: white;
      padding: 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1.5" fill="rgba(255,255,255,0.1)"/></svg>');
      animation: float 20s infinite linear;
    }
    
    @keyframes float {
      0% { transform: translateX(0px) translateY(0px); }
      100% { transform: translateX(-100px) translateY(-100px); }
    }
    
    .header.success {
      background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
    }
    
    .header.danger {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    }
    
    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
    }
    
    .header p {
      font-size: 1.2rem;
      opacity: 0.9;
      position: relative;
      z-index: 1;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px 40px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      will-change: transform;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .stat-number {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .stat-label {
      color: #666;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .stat-failed .stat-number { color: #e74c3c; }
    .stat-passed .stat-number { color: #27ae60; }
    .stat-new .stat-number { color: #f39c12; }
    .stat-deleted .stat-number { color: #9b59b6; }
    
    .section {
      padding: 40px;
    }
    
    .section:not(:last-child) {
      border-bottom: 1px solid #e9ecef;
    }
    
    .section h2 {
      font-size: 1.8rem;
      margin-bottom: 25px;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .section h2::before {
      content: '';
      width: 4px;
      height: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
    }
    
    .item-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
      gap: 25px;
    }
    
    .item-card {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      will-change: transform;
    }
    
    .item-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.1);
      border-color: #667eea;
    }
    
    .item-header {
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    
    .item-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    
    .item-name {
      font-weight: 600;
      color: #2c3e50;
      word-break: break-all;
      font-size: 0.95rem;
    }
    
    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .status-failed {
      background: #fee;
      color: #e74c3c;
      border: 1px solid #fadbd8;
    }
    
    .status-passed {
      background: #eaf8f0;
      color: #27ae60;
      border: 1px solid #d5f4e6;
    }
    
    .status-new {
      background: #fef9e7;
      color: #f39c12;
      border: 1px solid #fcf3cf;
    }
    
    .status-deleted {
      background: #f4ecf7;
      color: #9b59b6;
      border: 1px solid #e8daef;
    }
    
    .item-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    
    .detail-item {
      text-align: center;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e9ecef;
    }
    
    .detail-label {
      font-size: 0.75rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    
    .detail-value {
      font-weight: bold;
      font-size: 1.1rem;
    }
    
    .percentage-value {
      color: #e74c3c;
      font-size: 1.3rem;
    }
    
    .images-container {
      padding: 20px;
      background: #fafbfc;
    }
    
    .comparison-mode-selector {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .mode-btn {
      padding: 8px 16px;
      border: 2px solid #e9ecef;
      background: white;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.85rem;
      font-weight: 500;
    }
    
    .mode-btn.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }
    
    .mode-btn:hover:not(.active) {
      border-color: #667eea;
      color: #667eea;
    }
    
    .comparison-container {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      background: #f8f9fa;
      min-height: 300px;
    }
    
    .side-by-side-view {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    
    .slider-comparison {
      position: relative;
      overflow: hidden;
      border-radius: 8px;
      background: #f0f0f0;
    }
    
    .slider-images {
      position: relative;
      width: 100%;
      height: 400px;
    }
    
    .slider-image {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: white;
    }
    
    .slider-image.expected {
      z-index: 1;
    }
    
    .slider-image.actual {
      z-index: 2;
      clip-path: inset(0 50% 0 0);
      transition: clip-path 0.1s ease;
    }
    
    .slider-handle {
      position: absolute;
      top: 0;
      left: 50%;
      width: 4px;
      height: 100%;
      background: #667eea;
      cursor: ew-resize;
      z-index: 3;
      transform: translateX(-50%);
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
    }
    
    .slider-handle::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      background: #667eea;
      border: 3px solid white;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    
    .slider-handle::after {
      content: '⟷';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 12px;
      font-weight: bold;
      margin-top: -1px;
    }
    
    .image-item {
      text-align: center;
      position: relative;
    }
    
    .image-wrapper {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.2s ease;
      background: white;
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .image-wrapper:hover {
      transform: scale(1.02);
    }
    
    .image-wrapper img {
      width: 100%;
      height: 200px;
      object-fit: contain;
      border: none;
      display: block;
      transition: opacity 0.3s ease;
    }
    
    .image-label {
      margin-top: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .loading-placeholder {
      width: 100%;
      height: 200px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 0.9rem;
    }
    
    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }
    
    .empty-state-icon {
      font-size: 4rem;
      margin-bottom: 20px;
      opacity: 0.3;
    }
    
    .footer {
      background: #2c3e50;
      color: white;
      padding: 20px 40px;
      text-align: center;
      font-size: 0.9rem;
      opacity: 0.8;
    }
    
    .image-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0,0,0,0.7);
      color: white;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      z-index: 4;
    }
    
    .image-nav:hover {
      background: rgba(0,0,0,0.9);
      transform: translateY(-50%) scale(1.1);
    }
    
    .image-nav.prev {
      left: 10px;
    }
    
    .image-nav.next {
      right: 10px;
    }
    
    .overlay-comparison {
      position: relative;
    }
    
    .overlay-slider {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      background: rgba(0,0,0,0.8);
      border-radius: 20px;
      padding: 10px 15px;
      z-index: 5;
    }
    
    .overlay-slider input {
      width: 100%;
      margin: 5px 0;
    }
    
    .overlay-labels {
      display: flex;
      justify-content: space-between;
      color: white;
      font-size: 0.8rem;
    }
    
    @media (max-width: 768px) {
      .container {
        margin: 10px;
        border-radius: 8px;
      }
      
      .header {
        padding: 30px 20px;
      }
      
      .header h1 {
        font-size: 2rem;
      }
      
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
        padding: 20px;
        gap: 15px;
      }
      
      .section {
        padding: 30px 20px;
      }
      
      .item-grid {
        grid-template-columns: 1fr;
        gap: 20px;
      }
      
      .item-details {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .side-by-side-view {
        grid-template-columns: 1fr;
      }
      
      .comparison-mode-selector {
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .mode-btn {
        flex: 1;
        min-width: 100px;
      }
    }
    
    /* Enhanced Modal Styles */
    .image-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      cursor: pointer;
      backdrop-filter: blur(10px);
      animation: modalFadeIn 0.3s ease-out;
    }
    
    @keyframes modalFadeIn {
      from {
        opacity: 0;
        backdrop-filter: blur(0px);
      }
      to {
        opacity: 1;
        backdrop-filter: blur(10px);
      }
    }
    
    .image-modal-content {
      position: relative;
      width: 100vw;
      height: 100vh;
      background: white;
      cursor: default;
      overflow: hidden;
      animation: modalSlideIn 0.3s ease-out;
      display: flex;
      flex-direction: column;
    }
    
    @keyframes modalSlideIn {
      from {
        transform: scale(0.9) translateY(30px);
        opacity: 0;
      }
      to {
        transform: scale(1) translateY(0);
        opacity: 1;
      }
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 25px;
      background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
      color: white;
      border-bottom: 1px solid #34495e;
      flex-shrink: 0;
    }
    
    .modal-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .modal-close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .modal-close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }
    
    .modal-comparison-mode-selector {
      display: flex;
      justify-content: center;
      gap: 15px;
      padding: 20px 25px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    
    .modal-mode-btn {
      padding: 12px 20px;
      border: 2px solid #e9ecef;
      background: white;
      border-radius: 25px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.9rem;
      font-weight: 600;
      min-width: 120px;
      text-align: center;
    }
    
    .modal-mode-btn.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    
    .modal-mode-btn:hover:not(.active) {
      border-color: #667eea;
      color: #667eea;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
    }
    
    .modal-comparison-container {
      width: 100%;
      flex: 1;
      min-height: 0;
      position: relative;
      overflow: hidden;
      background: #f0f0f0;
    }
    
    .modal-slider-comparison {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    
    .modal-slider-images {
      position: relative;
      width: 100%;
      height: 100%;
    }
    
    .modal-slider-image {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: white;
    }
    
    .modal-slider-image.expected {
      z-index: 1;
    }
    
    .modal-slider-image.actual {
      z-index: 2;
      clip-path: inset(0 50% 0 0);
      transition: clip-path 0.1s ease;
    }
    
    .modal-slider-handle {
      position: absolute;
      top: 0;
      left: 50%;
      width: 6px;
      height: 100%;
      background: #667eea;
      cursor: ew-resize;
      z-index: 1000;
      transform: translateX(-50%);
      box-shadow: 0 0 15px rgba(0,0,0,0.4);
      pointer-events: auto;
    }
    
    .modal-slider-handle::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 30px;
      height: 30px;
      background: #667eea;
      border: 4px solid white;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 3px 12px rgba(0,0,0,0.3);
    }
    
    .modal-slider-handle::after {
      content: '⟷';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 16px;
      font-weight: bold;
      margin-top: -2px;
    }
    
    .modal-side-by-side-view {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      padding: 20px;
      height: 100%;
      overflow-y: auto;
    }
    
    .modal-image-item {
      text-align: center;
      position: relative;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .modal-image-wrapper {
      position: relative;
      height: calc(100% - 50px);
      min-height: 400px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    
    .modal-image-wrapper img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .modal-image-label {
      padding: 15px;
      background: #f8f9fa;
      font-weight: 600;
      color: #495057;
      border-top: 1px solid #e9ecef;
    }
    
    .modal-overlay-comparison {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .modal-overlay-images {
      position: relative;
      flex: 1;
      background: white;
    }
    
    .modal-overlay-base,
    .modal-overlay-top {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .modal-overlay-controls {
      padding: 20px;
      background: white;
      border-top: 1px solid #e9ecef;
    }
    
    .modal-overlay-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
      font-size: 0.9rem;
      color: #666;
      font-weight: 600;
    }
    
    .modal-opacity-slider {
      appearance: none;
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: #e9ecef;
      outline: none;
      cursor: pointer;
    }
    
    .modal-opacity-slider::-webkit-slider-thumb {
      appearance: none;
      width: 25px;
      height: 25px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    }
    
    .modal-opacity-slider::-moz-range-thumb {
      width: 25px;
      height: 25px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      border: none;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    }
    
    /* Image click indicator */
    .image-wrapper {
      position: relative;
      cursor: pointer;
    }
    
    .image-wrapper::after {
      content: '🔍 Click to enlarge';
      position: absolute;
      bottom: 5px;
      right: 5px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }
    
    .image-wrapper:hover::after {
      opacity: 1;
    }
    
    /* Magnifier/Zoom Controls */
    .zoom-controls {
      position: absolute;
      top: 80px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
      padding: 10px;
    }
    
    .zoom-help {
      color: #ccc;
      font-size: 11px;
      margin-top: 8px;
      text-align: center;
      max-width: 150px;
      line-height: 1.3;
      padding: 4px;
      background: rgba(0, 123, 204, 0.2);
      border-radius: 4px;
      border: 1px solid rgba(0, 123, 204, 0.3);
    }
    
    .zoom-help.active {
      background: rgba(76, 175, 80, 0.3);
      border-color: rgba(76, 175, 80, 0.5);
      color: #90EE90;
    }
    
    .zoom-btn {
      background: rgba(255, 255, 255, 0.9);
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #333;
    }
    
    .zoom-btn:hover {
      background: white;
      transform: scale(1.1);
    }
    
    .zoom-btn:active {
      transform: scale(0.95);
    }
    
    .zoom-level {
      color: white;
      font-size: 0.85rem;
      text-align: center;
      margin: 5px 0;
      font-weight: 600;
    }
    
    .zoomable-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: grab;
      user-select: none;
    }
    
    .zoomable-container.dragging {
      cursor: grabbing;
    }
    
          .zoomable-container.zoomed {
            cursor: move;
          }
          
          .zoomable-container.dragging {
            cursor: grabbing;
          }
          
          .zoomable-container:focus {
            outline: 2px solid #007acc;
            outline-offset: 2px;
          }    .zoomable-image {
      transition: transform 0.2s ease;
      transform-origin: center center;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    
    /* Modal responsive adjustments */
    @media (max-height: 600px) {
      .modal-header {
        padding: 10px 15px;
      }
      
      .modal-comparison-mode-selector {
        padding: 10px 15px;
      }
      
      .modal-image-wrapper {
        min-height: 200px;
      }
    }
    
    @media (max-width: 768px) {
      .modal-comparison-mode-selector {
        flex-wrap: wrap;
        gap: 10px;
        padding: 15px;
      }
      
      .modal-mode-btn {
        flex: 1;
        min-width: 110px;
        padding: 10px 15px;
      }
      
      .modal-side-by-side-view {
        grid-template-columns: 1fr;
        padding: 15px;
      }
    }
  `;
};

const createFallbackJS = () => {
  return `
    (function() {
      const data = window['__reg__'];
      const app = document.getElementById('app');
      
      if (!data) {
        app.innerHTML = '<div class="container"><div class="header danger"><h1>Error: No report data found</h1></div></div>';
        return;
      }
      
      // Performance optimization: Image preloading and caching
      const imageCache = new Map();
      const preloadImage = (src) => {
        if (imageCache.has(src)) return imageCache.get(src);
        
        const promise = new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
        
        imageCache.set(src, promise);
        return promise;
      };
      
      const formatPercentage = (percentage) => {
        if (typeof percentage === 'number') {
          return percentage.toFixed(4) + '%';
        }
        return 'N/A';
      };
      
      const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num);
      };
      
      const getStatusClass = (type) => {
        const classes = {
          'failed': 'status-failed',
          'passed': 'status-passed',
          'new': 'status-new',
          'deleted': 'status-deleted'
        };
        return classes[type] || 'status-failed';
      };
      
      const getStatusText = (type) => {
        const texts = {
          'failed': 'Failed',
          'passed': 'Passed',
          'new': 'New',
          'deleted': 'Deleted'
        };
        return texts[type] || 'Unknown';
      };
      
      const createSliderComparison = (item, type) => {
        const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
        const expectedSrc = \`\${data.expectedDir}/\${item.encoded}\`;
        const diffSrc = type === 'failed' ? \`\${data.diffDir}/\${item.encoded.replace(/\\.[^.]+$/, '.png')}\` : null;
        
        return \`
          <div class="slider-comparison">
            <div class="slider-images">
              <img class="slider-image expected" src="\${expectedSrc}" alt="Expected" style="opacity:0" />
              <img class="slider-image actual" src="\${actualSrc}" alt="Actual" style="opacity:0" />
              \${diffSrc ? \`<img class="slider-image diff" src="\${diffSrc}" alt="Diff" style="display:none;opacity:0" />\` : ''}
            </div>
            <div class="slider-handle"></div>
          </div>
        \`;
      };
      
      const createSideBySideView = (item, type) => {
        const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
        const expectedSrc = \`\${data.expectedDir}/\${item.encoded}\`;
        const diffSrc = type === 'failed' ? \`\${data.diffDir}/\${item.encoded.replace(/\\.[^.]+$/, '.png')}\` : null;
        
        return \`
          <div class="side-by-side-view">
            <div class="image-item">
              <div class="image-wrapper">
                <img src="\${expectedSrc}" alt="Expected" 
                     style="opacity:0;transition:opacity 0.3s"
                     onload="this.style.opacity='1'" 
                     onerror="this.parentNode.innerHTML='<div class=&quot;loading-placeholder&quot;>Expected image failed to load</div>'">
              </div>
              <div class="image-label">📋 Expected</div>
            </div>
            <div class="image-item">
              <div class="image-wrapper">
                <img src="\${actualSrc}" alt="Actual" 
                     style="opacity:0;transition:opacity 0.3s"
                     onload="this.style.opacity='1'" 
                     onerror="this.parentNode.innerHTML='<div class=&quot;loading-placeholder&quot;>Actual image failed to load</div>'">
              </div>
              <div class="image-label">🖼️ Actual</div>
            </div>
            \${diffSrc ? \`
              <div class="image-item">
                <div class="image-wrapper">
                  <img src="\${diffSrc}" alt="Diff" 
                       style="opacity:0;transition:opacity 0.3s"
                       onload="this.style.opacity='1'" 
                       onerror="this.parentNode.innerHTML='<div class=&quot;loading-placeholder&quot;>Diff image failed to load</div>'">
                </div>
                <div class="image-label">🔍 Difference</div>
              </div>
            \` : ''}
          </div>
        \`;
      };
      
      const createOverlayComparison = (item, type) => {
        const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
        const expectedSrc = \`\${data.expectedDir}/\${item.encoded}\`;
        
        return \`
          <div class="overlay-comparison">
            <div class="image-wrapper" style="position: relative;">
              <img class="overlay-base" src="\${expectedSrc}" alt="Expected" 
                   style="width:100%;height:300px;object-fit:contain;opacity:0;transition:opacity 0.3s"
                   onload="this.style.opacity='1'">
              <img class="overlay-top" src="\${actualSrc}" alt="Actual" 
                   style="position:absolute;top:0;left:0;width:100%;height:300px;object-fit:contain;opacity:0.5;transition:opacity 0.1s"
                   onload="this.style.opacity='0.5'">
            </div>
            <div class="overlay-slider">
              <div class="overlay-labels">
                <span>Expected</span>
                <span>Actual</span>
              </div>
              <input type="range" min="0" max="100" value="50" class="opacity-slider" 
                     style="width:100%;margin:5px 0;">
            </div>
          </div>
        \`;
      };
      
      const createStatsGrid = () => {
        const stats = [
          { label: 'Failed Tests', value: data.failedItems.length, type: 'failed' },
          { label: 'Passed Tests', value: data.passedItems.length, type: 'passed' },
          { label: 'New Images', value: data.newItems.length, type: 'new' },
          { label: 'Deleted Images', value: data.deletedItems.length, type: 'deleted' }
        ];
        
        return \`
          <div class="stats-grid">
            \${stats.map(stat => \`
              <div class="stat-card stat-\${stat.type}">
                <div class="stat-number">\${stat.value}</div>
                <div class="stat-label">\${stat.label}</div>
              </div>
            \`).join('')}
          </div>
        \`;
      };
      
      const createItemCard = (item, type) => {
        const hasPercentage = item.diffPercentage !== undefined;
        const percentage = hasPercentage ? formatPercentage(item.diffPercentage) : '';
        const statusClass = getStatusClass(type);
        const statusText = getStatusText(type);
        const hasComparison = type === 'failed' || type === 'passed';
        
        const detailsHTML = hasPercentage ? \`
          <div class="item-details">
            <div class="detail-item">
              <div class="detail-label">Difference</div>
              <div class="detail-value percentage-value">\${percentage}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Changed Pixels</div>
              <div class="detail-value">\${formatNumber(item.diffCount || 0)}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Width</div>
              <div class="detail-value">\${item.width || 'N/A'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Height</div>
              <div class="detail-value">\${item.height || 'N/A'}</div>
            </div>
          </div>
        \` : '';
        
        const imagesHTML = hasComparison ? \`
          <div class="images-container">
            <div class="comparison-mode-selector">
              <button class="mode-btn active" data-mode="slider">🔄 Slider</button>
              <button class="mode-btn" data-mode="side-by-side">📋 Side by Side</button>
              <button class="mode-btn" data-mode="overlay">👁️ Overlay</button>
            </div>
            <div class="comparison-container">
              <div class="comparison-content" data-mode="slider">
                \${createSliderComparison(item, type)}
              </div>
            </div>
          </div>
        \` : \`
          <div class="images-container">
            <div class="image-item">
              <div class="image-wrapper">
                <img src="\${data.actualDir}/\${item.encoded}" alt="\${item.raw}" 
                     style="opacity:0;transition:opacity 0.3s"
                     onload="this.style.opacity='1'" 
                     onerror="this.parentNode.innerHTML='<div class=&quot;loading-placeholder&quot;>Image failed to load</div>'">
              </div>
              <div class="image-label">\${type === 'new' ? '🆕 New Image' : '🗑️ Deleted Image'}</div>
            </div>
          </div>
        \`;
        
        return \`
          <div class="item-card" data-item-type="\${type}">
            <div class="item-header">
              <div class="item-title">
                <div class="item-name">\${item.raw}</div>
                <div class="status-badge \${statusClass}">\${statusText}</div>
              </div>
              \${detailsHTML}
            </div>
            \${imagesHTML}
          </div>
        \`;
      };
      
      const createSection = (title, items, type, icon = '') => {
        if (!items || items.length === 0) {
          return \`
            <div class="section">
              <h2>\${icon} \${title} (0)</h2>
              <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <p>No \${title.toLowerCase()} found</p>
              </div>
            </div>
          \`;
        }
        
        return \`
          <div class="section">
            <h2>\${icon} \${title} (\${items.length})</h2>
            <div class="item-grid">
              \${items.map(item => createItemCard(item, type)).join('')}
            </div>
          </div>
        \`;
      };
      
      const getTotalTests = () => {
        return data.failedItems.length + data.passedItems.length + data.newItems.length + data.deletedItems.length;
      };
      
      const getSuccessRate = () => {
        const total = getTotalTests();
        if (total === 0) return 100;
        return ((data.passedItems.length / total) * 100).toFixed(1);
      };
      
      const html = \`
        <div class="container">
          <div class="header \${data.type}">
            <h1>🔍 Visual Regression Test Report</h1>
            <p>
              \${getTotalTests()} total tests • \${getSuccessRate()}% success rate
              \${data.hasFailed ? \` • \${data.failedItems.length} failed\` : ''}
              \${data.hasNew ? \` • \${data.newItems.length} new\` : ''}
              \${data.hasDeleted ? \` • \${data.deletedItems.length} deleted\` : ''}
            </p>
          </div>
          
          \${createStatsGrid()}
          
          \${createSection('❌ Failed Tests', data.failedItems, 'failed')}
          \${createSection('✅ Passed Tests', data.passedItems, 'passed')}
          \${createSection('🆕 New Images', data.newItems, 'new')}
          \${createSection('🗑️ Deleted Images', data.deletedItems, 'deleted')}
          
          <div class="footer">
            <p>Generated by reg-cli with enhanced comparison tools • \${new Date().toLocaleString()}</p>
          </div>
        </div>
      \`;
      
      app.innerHTML = html;
      
      // Initialize interactive features after DOM is ready
      setTimeout(() => {
        initializeSliders();
        initializeModeSelectors();
        initializeImageZoom();
        initializePerformanceOptimizations();
      }, 100);
      
      function initializeSliders() {
        document.querySelectorAll('.slider-comparison').forEach(slider => {
          const handle = slider.querySelector('.slider-handle');
          const actualImg = slider.querySelector('.slider-image.actual');
          const expectedImg = slider.querySelector('.slider-image.expected');
          
          // Preload images for better performance
          const expectedSrc = expectedImg.src;
          const actualSrc = actualImg.src;
          
          Promise.all([preloadImage(expectedSrc), preloadImage(actualSrc)])
            .then(() => {
              expectedImg.style.opacity = '1';
              actualImg.style.opacity = '1';
            })
            .catch(() => {
              console.warn('Failed to preload images for slider');
            });
          
          let isDragging = false;
          
          const updateSlider = (clientX) => {
            const rect = slider.getBoundingClientRect();
            const x = clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
            
            handle.style.left = percentage + '%';
            actualImg.style.clipPath = \`inset(0 \${100 - percentage}% 0 0)\`;
          };
          
          // Mouse events
          handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.preventDefault();
          });
          
          slider.addEventListener('mousemove', (e) => {
            if (isDragging) {
              updateSlider(e.clientX);
            }
          });
          
          slider.addEventListener('click', (e) => {
            if (!isDragging) {
              updateSlider(e.clientX);
            }
          });
          
          document.addEventListener('mouseup', () => {
            isDragging = false;
          });
          
          // Touch events for mobile
          handle.addEventListener('touchstart', (e) => {
            isDragging = true;
            e.preventDefault();
          });
          
          slider.addEventListener('touchmove', (e) => {
            if (isDragging) {
              const touch = e.touches[0];
              updateSlider(touch.clientX);
              e.preventDefault();
            }
          });
          
          document.addEventListener('touchend', () => {
            isDragging = false;
          });
        });
      }
      
      function initializeModeSelectors() {
        document.querySelectorAll('.comparison-mode-selector').forEach(selector => {
          const buttons = selector.querySelectorAll('.mode-btn');
          const container = selector.parentNode.querySelector('.comparison-container');
          const content = container.querySelector('.comparison-content');
          const card = selector.closest('.item-card');
          const itemType = card.dataset.itemType;
          
          // Get item data
          const itemName = card.querySelector('.item-name').textContent;
          const item = [...data.failedItems, ...data.passedItems].find(i => i.raw === itemName);
          
          if (!item) return;
          
          buttons.forEach(button => {
            button.addEventListener('click', () => {
              const mode = button.dataset.mode;
              
              // Update active button
              buttons.forEach(btn => btn.classList.remove('active'));
              button.classList.add('active');
              
              // Update content
              content.dataset.mode = mode;
              
              switch (mode) {
                case 'slider':
                  content.innerHTML = createSliderComparison(item, itemType);
                  setTimeout(() => initializeSliders(), 50);
                  break;
                case 'side-by-side':
                  content.innerHTML = createSideBySideView(item, itemType);
                  break;
                case 'overlay':
                  content.innerHTML = createOverlayComparison(item, itemType);
                  setTimeout(() => initializeOverlaySliders(), 50);
                  break;
              }
            });
          });
        });
      }
      
      function initializeOverlaySliders() {
        document.querySelectorAll('.overlay-slider input').forEach(slider => {
          const overlayTop = slider.closest('.overlay-comparison').querySelector('.overlay-top');
          
          slider.addEventListener('input', (e) => {
            const value = e.target.value;
            overlayTop.style.opacity = value / 100;
          });
        });
      }
      
      function initializeImageZoom() {
        document.addEventListener('click', (e) => {
          if (e.target.tagName === 'IMG' && e.target.closest('.image-wrapper')) {
            e.preventDefault();
            const img = e.target;
            const itemCard = img.closest('.item-card');
            const itemType = itemCard?.dataset.itemType;
            
            // Get item data
            const itemName = itemCard?.querySelector('.item-name')?.textContent;
            const item = [...data.failedItems, ...data.passedItems, ...data.newItems, ...data.deletedItems]
              .find(i => i.raw === itemName);
            
            if (!item) {
              // Fallback to simple zoom for items without data
              createSimpleImageModal(img);
              return;
            }
            
            createComparisonModal(item, itemType, itemName);
          }
        });
      }
      
      function createSimpleImageModal(img) {
        const overlay = document.createElement('div');
        overlay.className = 'image-modal-overlay';
        
        const content = document.createElement('div');
        content.className = 'image-modal-content';
        content.style.cssText = \`
          width: 100vw;
          height: 100vh;
          background: white;
          overflow: hidden;
          cursor: default;
          display: flex;
          flex-direction: column;
        \`;
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = \`
          <h3 class="modal-title">🖼️ Image Preview</h3>
          <button class="modal-close-btn">✕</button>
        \`;
        
        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = \`
          padding: 20px;
          text-align: center;
          background: white;
          flex: 1;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 0;
        \`;
        
        const zoomedImg = img.cloneNode();
        zoomedImg.style.cssText = \`
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        \`;
        
        imageContainer.appendChild(zoomedImg);
        content.appendChild(header);
        content.appendChild(imageContainer);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        
        // Close functionality
        const closeModal = () => {
          overlay.style.opacity = '0';
          setTimeout(() => {
            document.body.removeChild(overlay);
          }, 300);
        };
        
        header.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModal();
        });
        
        document.addEventListener('keydown', function keyHandler(e) {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', keyHandler);
          }
        });
      }
      
      function createComparisonModal(item, itemType, itemName) {
        const overlay = document.createElement('div');
        overlay.className = 'image-modal-overlay';
        
        const content = document.createElement('div');
        content.className = 'image-modal-content';
        
        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const statusIcons = {
          'failed': '❌',
          'passed': '✅',
          'new': '🆕',
          'deleted': '🗑️'
        };
        
        const statusIcon = statusIcons[itemType] || '🖼️';
        
        header.innerHTML = \`
          <h3 class="modal-title">\${statusIcon} \${itemName}</h3>
          <div style="display: flex; align-items: center; gap: 15px;">
            <span style="font-size: 0.9rem; opacity: 0.9;">Fullscreen Comparison</span>
            <button class="modal-close-btn">✕</button>
          </div>
        \`;
        
        // Mode selector (only for failed and passed items)
        let modeSelector = '';
        if (itemType === 'failed' || itemType === 'passed') {
          modeSelector = \`
            <div class="modal-comparison-mode-selector">
              <button class="modal-mode-btn active" data-mode="slider">🔄 Slider Comparison</button>
              <button class="modal-mode-btn" data-mode="side-by-side">📋 Side by Side</button>
              <button class="modal-mode-btn" data-mode="overlay">👁️ Overlay Blend</button>
            </div>
          \`;
        }
        
        // Comparison container
        const comparisonContainer = document.createElement('div');
        comparisonContainer.className = 'modal-comparison-container';
        
        content.appendChild(header);
        if (modeSelector) {
          content.insertAdjacentHTML('beforeend', modeSelector);
        }
        content.appendChild(comparisonContainer);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        
        // Initialize with appropriate content
        if (itemType === 'failed' || itemType === 'passed') {
          comparisonContainer.innerHTML = createModalSliderComparison(item, itemType);
          initializeModalSliders(comparisonContainer);
          initializeModalModeSelector(content, item, itemType);
          initializeZoomControls(comparisonContainer);
        } else {
          // For new/deleted items, show single image
          const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
          comparisonContainer.innerHTML = \`
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: white; padding: 20px; overflow: hidden;">
              <img src="\${actualSrc}" alt="\${item.raw}" 
                   style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;">
            </div>
          \`;
        }
        
        // Close functionality
        const closeModal = () => {
          overlay.style.opacity = '0';
          setTimeout(() => {
            document.body.removeChild(overlay);
          }, 300);
        };
        
        header.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModal();
        });
        
        document.addEventListener('keydown', function keyHandler(e) {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', keyHandler);
          }
        });
      }
      
      function createModalSliderComparison(item, type) {
        const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
        const expectedSrc = \`\${data.expectedDir}/\${item.encoded}\`;
        const diffSrc = type === 'failed' ? \`\${data.diffDir}/\${item.encoded.replace(/\\.[^.]+$/, '.png')}\` : null;
        
        return \`
          <div class="modal-slider-comparison">
            <div class="zoomable-container">
              <div class="modal-slider-images">
                <img class="modal-slider-image expected zoomable-image" src="\${expectedSrc}" alt="Expected" />
                <img class="modal-slider-image actual zoomable-image" src="\${actualSrc}" alt="Actual" />
                \${diffSrc ? \`<img class="modal-slider-image diff zoomable-image" src="\${diffSrc}" alt="Diff" style="display:none;" />\` : ''}
              </div>
            </div>
            <div class="modal-slider-handle"></div>
            <div class="zoom-controls">
              <button class="zoom-btn" data-zoom="in">+</button>
              <div class="zoom-level">100%</div>
              <button class="zoom-btn" data-zoom="out">−</button>
              <button class="zoom-btn" data-zoom="reset">⌂</button>
              <div class="zoom-help">💡 Zoom: scroll wheel or +/− • Pan: drag or arrow keys • Reset: Home</div>
            </div>
          </div>
        \`;
      }
      
      function createModalSideBySideView(item, type) {
        const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
        const expectedSrc = \`\${data.expectedDir}/\${item.encoded}\`;
        const diffSrc = type === 'failed' ? \`\${data.diffDir}/\${item.encoded.replace(/\\.[^.]+$/, '.png')}\` : null;
        
        return \`
          <div class="modal-side-by-side-view">
            <div class="modal-image-item">
              <div class="modal-image-wrapper">
                <div class="zoomable-container">
                  <img class="zoomable-image" src="\${expectedSrc}" alt="Expected">
                </div>
                <div class="zoom-controls" style="top: 10px; right: 10px;">
                  <button class="zoom-btn" data-zoom="in" data-target="expected">+</button>
                  <div class="zoom-level">100%</div>
                  <button class="zoom-btn" data-zoom="out" data-target="expected">−</button>
                  <button class="zoom-btn" data-zoom="reset" data-target="expected">⌂</button>
                </div>
              </div>
              <div class="modal-image-label">📋 Expected</div>
            </div>
            <div class="modal-image-item">
              <div class="modal-image-wrapper">
                <div class="zoomable-container">
                  <img class="zoomable-image" src="\${actualSrc}" alt="Actual">
                </div>
                <div class="zoom-controls" style="top: 10px; right: 10px;">
                  <button class="zoom-btn" data-zoom="in" data-target="actual">+</button>
                  <div class="zoom-level">100%</div>
                  <button class="zoom-btn" data-zoom="out" data-target="actual">−</button>
                  <button class="zoom-btn" data-zoom="reset" data-target="actual">⌂</button>
                </div>
              </div>
              <div class="modal-image-label">🖼️ Actual</div>
            </div>
            \${diffSrc ? \`
              <div class="modal-image-item">
                <div class="modal-image-wrapper">
                  <div class="zoomable-container">
                    <img class="zoomable-image" src="\${diffSrc}" alt="Diff">
                  </div>
                  <div class="zoom-controls" style="top: 10px; right: 10px;">
                    <button class="zoom-btn" data-zoom="in" data-target="diff">+</button>
                    <div class="zoom-level">100%</div>
                    <button class="zoom-btn" data-zoom="out" data-target="diff">−</button>
                    <button class="zoom-btn" data-zoom="reset" data-target="diff">⌂</button>
                  </div>
                </div>
                <div class="modal-image-label">🔍 Difference</div>
              </div>
            \` : ''}
          </div>
        \`;
      }
      
      function createModalOverlayComparison(item, type) {
        const actualSrc = \`\${data.actualDir}/\${item.encoded}\`;
        const expectedSrc = \`\${data.expectedDir}/\${item.encoded}\`;
        
        return \`
          <div class="modal-overlay-comparison">
            <div class="modal-overlay-images">
              <div class="zoomable-container">
                <img class="modal-overlay-base zoomable-image" src="\${expectedSrc}" alt="Expected">
                <img class="modal-overlay-top zoomable-image" src="\${actualSrc}" alt="Actual" style="opacity: 0.5;">
              </div>
              <div class="zoom-controls">
                <button class="zoom-btn" data-zoom="in">+</button>
                <div class="zoom-level">100%</div>
                <button class="zoom-btn" data-zoom="out">−</button>
                <button class="zoom-btn" data-zoom="reset">⌂</button>
              </div>
            </div>
            <div class="modal-overlay-controls">
              <div class="modal-overlay-labels">
                <span>📋 Expected</span>
                <span>🖼️ Actual</span>
              </div>
              <input type="range" min="0" max="100" value="50" class="modal-opacity-slider">
            </div>
          </div>
        \`;
      }
      
      function initializeModalSliders(container) {
        const slider = container.querySelector('.modal-slider-comparison');
        if (!slider) return;
        
        const handle = slider.querySelector('.modal-slider-handle');
        const actualImg = slider.querySelector('.modal-slider-image.actual');
        const zoomableContainer = slider.querySelector('.zoomable-container');
        
        let isDragging = false;
        let currentSliderPosition = 50; // Percentage
        
        const updateSlider = (clientX) => {
          const sliderRect = slider.getBoundingClientRect();
          const x = clientX - sliderRect.left;
          const percentage = Math.max(0, Math.min(100, (x / sliderRect.width) * 100));
          
          currentSliderPosition = percentage;
          handle.style.left = percentage + '%';
          actualImg.style.clipPath = \`inset(0 \${100 - percentage}% 0 0)\`;
        };
        
        const updateSliderFromZoom = () => {
          // Maintain slider position when zooming
          handle.style.left = currentSliderPosition + '%';
          actualImg.style.clipPath = \`inset(0 \${100 - currentSliderPosition}% 0 0)\`;
        };
        
        // Store the update function for zoom controls to use
        if (zoomableContainer) {
          zoomableContainer.updateSlider = updateSliderFromZoom;
        }
        
        // Mouse events
        handle.addEventListener('mousedown', (e) => {
          isDragging = true;
          e.preventDefault();
          e.stopPropagation();
        });
        
        slider.addEventListener('mousemove', (e) => {
          if (isDragging) {
            updateSlider(e.clientX);
            e.stopPropagation();
          }
        });
        
        slider.addEventListener('click', (e) => {
          if (!isDragging && !e.target.closest('.zoom-controls, .zoom-btn')) {
            updateSlider(e.clientX);
          }
        });
        
        document.addEventListener('mouseup', () => {
          isDragging = false;
        });
        
        // Touch events for mobile
        handle.addEventListener('touchstart', (e) => {
          isDragging = true;
          e.preventDefault();
          e.stopPropagation();
        });
        
        slider.addEventListener('touchmove', (e) => {
          if (isDragging) {
            const touch = e.touches[0];
            updateSlider(touch.clientX);
            e.preventDefault();
            e.stopPropagation();
          }
        });
        
        document.addEventListener('touchend', () => {
          isDragging = false;
        });
      }
      
      function initializeModalModeSelector(content, item, itemType) {
        const buttons = content.querySelectorAll('.modal-mode-btn');
        const container = content.querySelector('.modal-comparison-container');
        
        buttons.forEach(button => {
          button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            
            // Update active button
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update content
            switch (mode) {
              case 'slider':
                container.innerHTML = createModalSliderComparison(item, itemType);
                initializeModalSliders(container);
                initializeZoomControls(container);
                break;
              case 'side-by-side':
                container.innerHTML = createModalSideBySideView(item, itemType);
                initializeZoomControls(container);
                break;
              case 'overlay':
                container.innerHTML = createModalOverlayComparison(item, itemType);
                initializeModalOverlaySlider(container);
                initializeZoomControls(container);
                break;
            }
          });
        });
      }
      
      function initializeModalOverlaySlider(container) {
        const slider = container.querySelector('.modal-opacity-slider');
        const overlayTop = container.querySelector('.modal-overlay-top');
        
        if (slider && overlayTop) {
          slider.addEventListener('input', (e) => {
            const value = e.target.value;
            overlayTop.style.opacity = value / 100;
          });
        }
      }
      
      function initializeZoomControls(container) {
        const zoomContainers = container.querySelectorAll('.zoomable-container');
        
        zoomContainers.forEach((zoomContainer, index) => {
          let currentZoom = 1;
          let isDragging = false;
          let startX = 0;
          let startY = 0;
          let translateX = 0;
          let translateY = 0;
          
          const images = zoomContainer.querySelectorAll('.zoomable-image');
          const zoomControls = container.querySelectorAll('.zoom-controls')[index];
          const zoomLevel = zoomControls?.querySelector('.zoom-level');
          const zoomHelp = zoomControls?.querySelector('.zoom-help');
          
          // Calculate pan boundaries based on actual image and container dimensions
          const getPanBounds = () => {
            if (!images.length || currentZoom <= 1) return { maxX: 0, maxY: 0 };
            
            const img = images[0];
            const containerRect = zoomContainer.getBoundingClientRect();
            
            // Get the actual rendered size of the image (before zoom transform)
            const imgRect = img.getBoundingClientRect();
            const imgWidth = imgRect.width / currentZoom; // Get base width before current zoom
            const imgHeight = imgRect.height / currentZoom; // Get base height before current zoom
            
            // Calculate how much the image extends beyond container when zoomed
            const scaledWidth = imgWidth * currentZoom;
            const scaledHeight = imgHeight * currentZoom;
            
            // Maximum translation in pixels (accounting for translate being applied before scale)
            // We divide by currentZoom because translate happens before scale in the transform
            const maxX = Math.max(0, (scaledWidth - containerRect.width) / (2 * currentZoom));
            const maxY = Math.max(0, (scaledHeight - containerRect.height) / (2 * currentZoom));
            
            return { maxX, maxY };
          };
          
          const updateTransform = () => {
            // Apply pan bounds constraint
            const bounds = getPanBounds();
            translateX = Math.max(-bounds.maxX, Math.min(bounds.maxX, translateX));
            translateY = Math.max(-bounds.maxY, Math.min(bounds.maxY, translateY));
            
            images.forEach(img => {
              img.style.transform = \`scale(\${currentZoom}) translate(\${translateX}px, \${translateY}px)\`;
            });
            if (zoomLevel) {
              zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
            }
            
            // Update help text based on zoom state
            if (zoomHelp) {
              if (currentZoom > 1) {
                zoomHelp.classList.add('active');
                zoomHelp.textContent = '✓ Pan active: drag to scroll or use arrow keys';
              } else {
                zoomHelp.classList.remove('active');
                zoomHelp.textContent = '💡 Zoom: scroll wheel or +/− • Pan: drag or arrow keys';
              }
            }
            
            // Update container cursor based on zoom level
            if (currentZoom > 1) {
              zoomContainer.classList.add('zoomed');
              zoomContainer.style.cursor = isDragging ? 'grabbing' : 'grab';
            } else {
              zoomContainer.classList.remove('zoomed');
              zoomContainer.style.cursor = 'default';
            }
            
            // Update slider position if in slider mode
            if (zoomContainer.updateSlider) {
              zoomContainer.updateSlider();
            }
          };
          
          const resetPosition = () => {
            translateX = 0;
            translateY = 0;
            updateTransform();
          };
          
          // Zoom button controls
          if (zoomControls) {
            zoomControls.addEventListener('click', (e) => {
              const btn = e.target.closest('.zoom-btn');
              if (!btn) return;
              
              const action = btn.dataset.zoom;
              switch (action) {
                case 'in':
                  currentZoom = Math.min(currentZoom * 1.5, 10);
                  updateTransform();
                  break;
                case 'out':
                  currentZoom = Math.max(currentZoom / 1.5, 0.1);
                  // Reset position if zooming out to 1x or less
                  if (currentZoom <= 1) {
                    resetPosition();
                  } else {
                    updateTransform();
                  }
                  break;
                case 'reset':
                  currentZoom = 1;
                  resetPosition();
                  break;
              }
            });
          }
          
          // Mouse wheel zoom
          zoomContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(10, currentZoom * delta));
            
            // If zooming out past 1x, reset position
            if (newZoom <= 1 && currentZoom > 1) {
              currentZoom = 1;
              resetPosition();
            } else {
              currentZoom = newZoom;
              updateTransform();
            }
          }, { passive: false });
          
          // Pan functionality when zoomed
          zoomContainer.addEventListener('mousedown', (e) => {
            // Don't pan if clicking on slider handle or zoom controls
            if (e.target.closest('.modal-slider-handle, .zoom-controls')) {
              return;
            }
            
            if (currentZoom > 1) {
              isDragging = true;
              startX = e.clientX - translateX;
              startY = e.clientY - translateY;
              zoomContainer.classList.add('dragging');
              zoomContainer.style.cursor = 'grabbing';
              e.preventDefault();
            }
          });
          
          document.addEventListener('mousemove', (e) => {
            if (isDragging && currentZoom > 1) {
              translateX = e.clientX - startX;
              translateY = e.clientY - startY;
              updateTransform();
              e.preventDefault();
            }
          });
          
          document.addEventListener('mouseup', () => {
            if (isDragging) {
              isDragging = false;
              zoomContainer.classList.remove('dragging');
              if (currentZoom > 1) {
                zoomContainer.style.cursor = 'grab';
              }
            }
          });
          
          // Keyboard navigation when focused
          zoomContainer.setAttribute('tabindex', '0');
          zoomContainer.addEventListener('keydown', (e) => {
            if (currentZoom > 1) {
              const step = 20;
              switch (e.key) {
                case 'ArrowUp':
                  translateY += step;
                  updateTransform();
                  e.preventDefault();
                  break;
                case 'ArrowDown':
                  translateY -= step;
                  updateTransform();
                  e.preventDefault();
                  break;
                case 'ArrowLeft':
                  translateX += step;
                  updateTransform();
                  e.preventDefault();
                  break;
                case 'ArrowRight':
                  translateX -= step;
                  updateTransform();
                  e.preventDefault();
                  break;
                case 'Home':
                  translateX = 0;
                  translateY = 0;
                  updateTransform();
                  e.preventDefault();
                  break;
              }
            }
          });
          
          // Touch support for mobile
          let lastTouchDistance = 0;
          
          zoomContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
              lastTouchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
              );
            } else if (e.touches.length === 1 && currentZoom > 1) {
              isDragging = true;
              startX = e.touches[0].clientX - translateX;
              startY = e.touches[0].clientY - translateY;
            }
          });
          
          zoomContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
            
            if (e.touches.length === 2) {
              const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
              );
              
              if (lastTouchDistance > 0) {
                const scale = currentDistance / lastTouchDistance;
                currentZoom = Math.max(0.1, Math.min(10, currentZoom * scale));
                updateTransform();
              }
              
              lastTouchDistance = currentDistance;
            } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
              translateX = e.touches[0].clientX - startX;
              translateY = e.touches[0].clientY - startY;
              updateTransform();
            }
          }, { passive: false });
          
          zoomContainer.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
              isDragging = false;
              lastTouchDistance = 0;
            }
          });
        });
      }
      
      function initializePerformanceOptimizations() {
        // Lazy loading for images below the fold
        if ('IntersectionObserver' in window) {
          const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                  img.src = img.dataset.src;
                  img.removeAttribute('data-src');
                  observer.unobserve(img);
                }
              }
            });
          }, {
            rootMargin: '50px'
          });
          
          document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
          });
        }
        
        // Reduce animation on scroll for better performance
        let ticking = false;
        const optimizeScrolling = () => {
          if (!ticking) {
            requestAnimationFrame(() => {
              // Throttle any scroll-based animations
              ticking = false;
            });
            ticking = true;
          }
        };
        
        window.addEventListener('scroll', optimizeScrolling, { passive: true });
      }
    })();
  `;
};

const createJSONReport = params => {
  const report = {
    failedItems: params.failedItems,
    newItems: params.newItems,
    deletedItems: params.deletedItems,
    passedItems: params.passedItems,
    expectedItems: params.expectedItems,
    actualItems: params.actualItems,
    diffItems: params.diffItems,
    actualDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.actualDir)}`,
    expectedDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.expectedDir)}`,
    diffDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.diffDir)}`,
  };
  
  // Add diffDetails if available
  if (params.diffDetails) {
    report.diffDetails = params.diffDetails;
  }
  
  return report;
};

const createHTMLReport = params => {
  const file = path.join(__dirname, '../template/template.html');
  
  // Try to read UI files, fall back to simple template if they don't exist
  let js = '';
  let css = '';
  
  try {
    js = fs.readFileSync(path.join(__dirname, '../report/ui/dist/report.js'));
    css = fs.readFileSync(path.join(__dirname, '../report/ui/dist/style.css'));
  } catch (e) {
    // Fall back to simple inline implementation
    js = createFallbackJS();
    css = createFallbackCSS();
  }
  
  const template = fs.readFileSync(file);
  
  // Helper function to add percentage info to items
  const addPercentageInfo = (items) => {
    return items.map(item => {
      const encoded = encodeFilePath(item);
      const diffDetail = params.diffDetails && params.diffDetails[item];
      return {
        raw: item,
        encoded,
        ...(diffDetail && {
          diffPercentage: diffDetail.diffPercentage,
          diffCount: diffDetail.diffCount,
          width: diffDetail.width,
          height: diffDetail.height
        })
      };
    });
  };
  
  const json = {
    type: params.failedItems.length === 0 ? 'success' : 'danger',
    hasNew: params.newItems.length > 0,
    newItems: params.newItems.map(item => ({ raw: item, encoded: encodeFilePath(item) })),
    hasDeleted: params.deletedItems.length > 0,
    deletedItems: params.deletedItems.map(item => ({ raw: item, encoded: encodeFilePath(item) })),
    hasPassed: params.passedItems.length > 0,
    passedItems: addPercentageInfo(params.passedItems),
    hasFailed: params.failedItems.length > 0,
    failedItems: addPercentageInfo(params.failedItems),
    actualDir: params.fromJSON
      ? params.actualDir
      : `${params.urlPrefix}${path.relative(path.dirname(params.report), params.actualDir)}`,
    expectedDir: params.fromJSON
      ? params.expectedDir
      : `${params.urlPrefix}${path.relative(path.dirname(params.report), params.expectedDir)}`,
    diffDir: params.fromJSON
      ? params.diffDir
      : `${params.urlPrefix}${path.relative(path.dirname(params.report), params.diffDir)}`,
    ximgdiffConfig: {
      enabled: params.enableClientAdditionalDetection,
      workerUrl: `${params.urlPrefix}worker.js`,
    },
    // Include diffDetails for client-side usage
    diffDetails: params.diffDetails || {},
  };
  const faviconType = json.hasFailed || json.hasNew || json.hasDeleted ? 'failure' : 'success';
  const view = {
    js,
    css,
    report: JSON.stringify(json),
    faviconData: loadFaviconAsDataURL(faviconType),
  };
  return Mustache.render(template.toString(), view);
};

const createJunitReport = params => {
  const failedTests = params.failedItems.length + params.newItems.length + params.deletedItems.length;
  const numberOfTests = failedTests + params.passedItems.length;
  const doc = xmlBuilder.create({ version: '1.0' });
  const testsuitesElement = doc.ele('testsuites', {
    name: 'reg-cli tests',
    tests: numberOfTests,
    failures: failedTests,
  });
  const testsuiteElement = testsuitesElement.ele('testsuite', {
    name: 'reg-cli',
    tests: numberOfTests,
    failures: failedTests,
  });
  params.failedItems.forEach(item => {
    addFailedJunitTestElement(testsuiteElement, item, 'failed');
  });
  params.newItems.forEach(item => {
    if (params.extendedErrors) {
      addFailedJunitTestElement(testsuiteElement, item, 'newItem');
    } else {
      addPassedJunitTestElement(testsuiteElement, item);
    }
  });
  params.deletedItems.forEach(item => {
    if (params.extendedErrors) {
      addFailedJunitTestElement(testsuiteElement, item, 'deletedItem');
    } else {
      addPassedJunitTestElement(testsuiteElement, item);
    }
  });
  params.passedItems.forEach(item => {
    addPassedJunitTestElement(testsuiteElement, item);
  });
  return doc.end({ prettyPrint: true });
};

function addPassedJunitTestElement(testsuiteElement, item: string) {
  testsuiteElement.ele('testcase', { name: item });
}

function addFailedJunitTestElement(testsuiteElement, item: string, reason: string) {
  testsuiteElement.ele('testcase', { name: item }).ele('failure', { message: reason });
}

function createXimdiffWorker(params: ReportParams) {
  const file = path.join(__dirname, '../template/worker_pre.js');
  const moduleJs = fs.readFileSync(path.join(__dirname, '../report/ui/dist/worker.js'), 'utf8');
  const wasmLoaderJs = fs.readFileSync(detectDiff.getBrowserJsPath(), 'utf8');
  const template = fs.readFileSync(file);
  const ximgdiffWasmUrl = `${params.urlPrefix}detector.wasm`;
  return Mustache.render(template.toString(), { ximgdiffWasmUrl }) + '\n' + moduleJs + '\n' + wasmLoaderJs;
}

export default (params: ReportParams) => {
  if (!!params.report) {
    const html = createHTMLReport(params);
    mkdirp.sync(path.dirname(params.report));
    fs.writeFileSync(params.report, html);
    if (!!params.enableClientAdditionalDetection) {
      const workerjs = createXimdiffWorker(params);
      fs.writeFileSync(path.resolve(path.dirname(params.report), 'worker.js'), workerjs);
      const wasmBuf = fs.readFileSync(detectDiff.getBrowserWasmPath());
      fs.writeFileSync(path.resolve(path.dirname(params.report), 'detector.wasm'), wasmBuf);
    }
  }
  if (!!params.junitReport) {
    const junitXml = createJunitReport(params);
    mkdirp.sync(path.dirname(params.junitReport));
    fs.writeFileSync(params.junitReport, junitXml);
  }

  const json = createJSONReport(params);
  if (!params.fromJSON) {
    mkdirp.sync(path.dirname(params.json));
    fs.writeFileSync(params.json, JSON.stringify(json));
  }
  return json;
};
