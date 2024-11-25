import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter as Router } from 'react-router-dom';
import { initSatellite } from "@junobuild/core";
import Store from './components/Store';

// const init = async () => {
// await initSatellite({
//   satelliteId: "orkad-xyaaa-aaaal-ai7ta-cai"
// });

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Router>
    <Store>
      <App />
      </Store>
    </Router>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals();
// };
// init();