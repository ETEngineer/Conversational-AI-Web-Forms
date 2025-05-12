import React from 'react';
import './Navbar.css';

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-links">
          <a href="/" className="navbar-link">
            Dashboard
          </a>
          <a href="/forms/new" className="navbar-link">
            Create Form
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;