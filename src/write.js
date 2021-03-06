import { MAGIC, LATEST_VERSION, MAX_INT } from './constants';
import { write, isEqual } from './utils';


// TODO: Validate input saves
function validate(save) {
  if (typeof save !== 'object') {
    throw new Error('Expected save to be an object');
  }

  if (typeof save.bricks !== 'object' && save.bricks.length) {
    throw new Error('Expected save to have bricks field');
  }

  if (!save.bricks.every(b => typeof b.size === 'object' && typeof b.position === 'object'))
    throw new Error('Expected every brick to have size and position arrays')
}

// looks up a value in an object or returns a defualt value
function get(obj, path='', def) {
  // Split the path up by .
  path = path.split('.').filter(p => p);

  // Get the child at each part of the path
  while (path.length && typeof obj === 'object') {
    obj = obj[path.splice(0, 1)[0]];
  }

  return typeof obj !== 'undefined' ? obj : def;
}

export default function writeBrs(save) {
  validate(save);

  if(save.bricks.length > MAX_INT) {
    throw new Error('Brick count out of range');
  }

  // Convert from BGRA to RGBA
  const rgba = ([r, g, b, a]) => [b, g, r, a];

  const buff = [].concat(
    // Write magic bytes
    MAGIC,
    write.u16(LATEST_VERSION),

    // Header 1
    write.compressed(
      write.string(get(save, 'map', 'Unknown')),
      write.string(get(save, 'author.name', 'Unknown')),
      write.string(get(save, 'description', '')),
      write.uuid(get(save, 'author.id', '00000000-0000-0000-0000-000000000000')),
      get(save, 'save_time', [0, 0, 0, 0, 0, 0, 0, 0]),
      write.i32(get(save, 'bricks', []).length),
    ),


    // Header 2
    write.compressed(
      write.array(get(save, 'mods', []), write.string),
      write.array(get(save, 'brick_assets', ['PB_DefaultBrick']), write.string),
      write.array(get(save, 'colors', []), rgba),
      write.array(get(save, 'materials', ['BMC_Plastic']), write.string),
      write.array(get(save, 'brick_owners', [{}]), ({ id='00000000-0000-0000-0000-000000000000', name='Unknown' }={}) => [].concat(
        write.uuid(id),
        write.string(name),
      )),
    ),

    // Bricks
    write.compressed(write.bits()
      .each(save.bricks, function(brick) {
        this.align();
        this.int(get(brick, 'asset_name_index', 0), Math.max(get(save, 'brick_assets', []).length, 2));

        const isSingularity = isEqual(brick.size, [0, 0, 0]);
        this.bit(!isSingularity);
        if (!isSingularity) {
          brick.size.map(s => this.uint_packed(s));
        }
        brick.position.map(s => this.int_packed(s));
        const orientation = (get(brick, 'direction', 4) << 2) | get(brick, 'rotation', 0);
        this.int(orientation, 24);
        this.bit(get(brick, 'collision', true));
        this.bit(get(brick, 'visibility', true));
        this.bit(brick.material_index !== 1);
        if (brick.material_index !== 1) {
          this.uint_packed(brick.material_index);
        }

        if (typeof brick.color === 'number') {
          this.bit(false);
          this.int(brick.color, Math.max(get(save, 'colors', []).length, 2));
        } else {
          this.bit(true);
          this.bytes(rgba(get(brick, 'color', [255, 255, 255, 255])));
        }

        this.uint_packed(get(brick, 'owner_index', 1));
      })
      .finish()
    ),
  );

  return new Uint8Array(buff);
}