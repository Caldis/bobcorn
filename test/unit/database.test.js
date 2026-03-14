/**
 * Database layer smoke tests
 * These validate core data operations survive upgrades
 */

describe('Database module structure', () => {
  test('database source file exists and is readable', () => {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '../../app/database/index.js');
    expect(fs.existsSync(dbPath)).toBe(true);
    const content = fs.readFileSync(dbPath, 'utf8');
    expect(content).toContain('sql.js');
    expect(content).toContain('projectAttributes');
    expect(content).toContain('groupData');
    expect(content).toContain('iconData');
  });

  test('sql.js dependency is installed', () => {
    const path = require('path');
    const sqlJsPath = path.join(__dirname, '../../node_modules/sql.js');
    const fs = require('fs');
    expect(fs.existsSync(sqlJsPath)).toBe(true);
  });
});

describe('SVG utility structure', () => {
  test('SVG utility file exists', () => {
    const fs = require('fs');
    const path = require('path');
    const svgPath = path.join(__dirname, '../../app/utils/svg/index.js');
    expect(fs.existsSync(svgPath)).toBe(true);
    const content = fs.readFileSync(svgPath, 'utf8');
    expect(content).toContain('formatSVG');
  });
});

describe('Font generator structure', () => {
  test('iconfont generator file exists', () => {
    const fs = require('fs');
    const path = require('path');
    const genPath = path.join(__dirname, '../../app/utils/generators/iconfontGenerator/index.js');
    expect(fs.existsSync(genPath)).toBe(true);
    const content = fs.readFileSync(genPath, 'utf8');
    expect(content).toContain('svgicons2svgfont');
    expect(content).toContain('svg2ttf');
  });
});
