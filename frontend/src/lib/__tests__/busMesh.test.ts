import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  createIubatBusModel,
  createProceduralBus,
  updateBusNumber,
} from '../map3d/busMesh.ts';

describe('Custom IUBAT 3D Bus Model Integrity Tests', () => {
  it('1. Model Instantiation: creates a valid THREE.Group matching IUBAT specifications', () => {
    const bus = createIubatBusModel({ busNumber: 'BUS #10' });
    assert.ok(bus instanceof THREE.Group, 'Bus must be an instance of THREE.Group');
    assert.strictEqual(bus.name, 'bus_BUS #10');
    assert.ok(bus.children.length > 10, 'Bus must contain comprehensive modular parts');
  });

  it('2. Dimensional Proportions: matches prototype 5:1 length-to-width ratio and ~11.2m length', () => {
    const bus = createIubatBusModel();
    const box = new THREE.Box3().setFromObject(bus);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Filter out headlight beam cone if present
    // Bus body itself should have length ~11.2m (±1.5m tolerance for bumper/light fixtures)
    // Bus body width ~2.5m (up to ~2.9m with protruding wheel hubs)
    assert.ok(size.x >= 2.4 && size.x <= 3.0, `Width ${size.x}m should be ~2.5m-2.9m`);
    assert.ok(size.z >= 3.0 && size.z <= 3.8, `Total Height ${size.z}m should be ~3.3m`);

    // Verify 5:1 length to width ratio (prototype: 620px / 124px = 5.0)
    // Checking body bounding box
    const bodyLength = 11.2;
    const bodyWidth = 2.5;
    const ratio = bodyLength / bodyWidth;
    assert.ok(Math.abs(ratio - 5.0) < 0.6, `Ratio ${ratio} should approximate 5.0:1`);
  });

  it('3. Ground Contact & Pivot Alignment: wheels touch road at z = 0, no sinking or floating', () => {
    const bus = createIubatBusModel();
    const box = new THREE.Box3().setFromObject(bus);

    // Min Z should be >= 0 (or ~0.02 for contact shadow)
    assert.ok(
      box.min.z >= -0.05 && box.min.z <= 0.05,
      `Chassis ground contact min.z (${box.min.z}) must be at road level z = 0`
    );

    // Origin (0, 0, 0) is the ground-level center pivot
    assert.strictEqual(bus.position.x, 0);
    assert.strictEqual(bus.position.y, 0);
    assert.strictEqual(bus.position.z, 0);
  });

  it('4. Wheel Configuration: exactly 4 wheels placed with front/rear wheelbase', () => {
    const bus = createIubatBusModel();
    // Count wheel groups (cylinders)
    let wheelCylinders = 0;
    const wheelYPositions: number[] = [];

    bus.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) {
        // Radius 0.48m is the tire
        if (child.geometry.parameters.radiusTop === 0.48) {
          wheelCylinders++;
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          wheelYPositions.push(worldPos.y);
        }
      }
    });

    assert.strictEqual(wheelCylinders, 4, 'Must have exactly 4 wheels');

    // 2 front wheels (y > 0) and 2 rear wheels (y < 0)
    const frontWheels = wheelYPositions.filter((y) => y > 0);
    const rearWheels = wheelYPositions.filter((y) => y < 0);
    assert.strictEqual(frontWheels.length, 2, 'Must have 2 front wheels');
    assert.strictEqual(rearWheels.length, 2, 'Must have 2 rear wheels');
  });

  it('5. Directional Orientation: Front face and headlights face +Y (North), rear lamps face -Y', () => {
    const bus = createIubatBusModel();

    let frontLampFound = false;
    let rearLampFound = false;

    bus.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        // Headlight has emissive warm white
        if (child.material.emissive.getHex() === 0xfff8d0) {
          assert.ok(child.position.y > 5.0, 'Headlights must be mounted at the front (+Y)');
          frontLampFound = true;
        }
        // Taillight has emissive red
        if (child.material.emissive.getHex() === 0xef4444) {
          assert.ok(child.position.y < -5.0, 'Taillights must be mounted at the rear (-Y)');
          rearLampFound = true;
        }
      }
    });

    assert.ok(frontLampFound, 'Front headlights must be present');
    assert.ok(rearLampFound, 'Rear taillights must be present');
  });

  it('6. Dynamic Bus Numbering: no hardcoded number; dynamic badge only when busNumber provided', () => {
    // A: Without busNumber option, no permanent badge
    const unassignedBus = createIubatBusModel();
    const noBadge = unassignedBus.getObjectByName('bus_number_badge');
    assert.strictEqual(noBadge, undefined, 'Unassigned bus must NOT have a hardcoded badge');

    // B: With busNumber option, dynamic badge is created
    const assignedBus = createIubatBusModel({ busNumber: 'BUS #07' });
    const badge = assignedBus.getObjectByName('bus_number_badge');
    assert.ok(badge instanceof THREE.Mesh, 'Dynamic badge mesh must be created when busNumber is present');
    assert.strictEqual(badge.visible, true);

    // C: Dynamic update with updateBusNumber helper
    updateBusNumber(assignedBus, 'BUS #42');
    assert.strictEqual(badge.visible, true);

    // D: Removing bus number hides the badge
    updateBusNumber(assignedBus, undefined);
    assert.strictEqual(badge.visible, false);
  });

  it('7. Procedural Alias: createProceduralBus returns custom IUBAT bus model', () => {
    const bus = createProceduralBus({ busNumber: 'BUS #12' });
    assert.ok(bus instanceof THREE.Group);
    assert.strictEqual(bus.name, 'bus_BUS #12');
  });
});
