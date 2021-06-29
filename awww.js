/*
 * Guinda - Audio widgets for web views
 * Copyright (C) 2021 Luciano Iam <oss@lucianoiam.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

 /**
  *  Base class for all widgets
  */

class Widget extends HTMLElement {

    /**
     *  Public
     */

    get opt() {
        return this._opt;
    }

    set opt(opt) {
        this._opt = opt;
    }

    replaceTemplateById(id) {
        const old = document.querySelector(`template[id=${id}]`);
        old.parentNode.insertBefore(this, old);
        old.parentNode.removeChild(old);
        
        this.id = id;
        
        return this;
    }

    /**
     *  Internal
     */

    static get _unqualifiedNodeName() {
        throw new TypeError(`_unqualifiedNodeName not implemented for ${this.name}`);
    }

    static _staticInit() {
        window.customElements.define(`a-${this._unqualifiedNodeName}`, this);
    }
    
    constructor() {
        super();
        this._opt = {};
    }

    connectedCallback() {
        if (!this._instanceInitialized) {
            this._instanceInit();
            this._instanceInitialized = true;
        }
    }

    _instanceInit() {
        //
        // [NotSupportedError: A newly constructed custom element must not have attributes
        //
        // To avoid the error a custom _instanceInit() is implemented that gets
        // called when the runtime calls this.connectedCallback(), because
        // concrete classes [ the ones whose instances are ultimately created by
        // calling document.createElementById() ] must not set attributes in the
        // constructor body, like this:
        //
        // constructor() {
        //    super();
        //    this._foo = {};
        // }
        //
        // There is no problem in setting attributes during super() though.
        // This is a silly limitation to the otherwise nice looking HTML5/ES6.
        //
    }
}

/**
 *  Base class for widgets supporting unified mouse and touch control
 */

class ControlEvent extends UIEvent {}

class TouchAndMouseControllableWidget extends Widget {

    /**
     *  Internal
     */

    constructor() {
        super();

        // Handle touch events preventing subsequent simulated mouse events

        this.addEventListener('touchstart', (ev) => {
            this._handleInputStart(ev, ev.touches[0].clientX, ev.touches[0].clientY);

            if (ev.cancelable) {
                ev.preventDefault();
            }
        });

        this.addEventListener('touchmove', (ev) => {
            this._handleInputContinue(ev, ev.touches[0].clientX, ev.touches[0].clientY);

            if (ev.cancelable) {
                ev.preventDefault();
            }
        });
        
        this.addEventListener('touchend', (ev) => {
            this._handleInputEnd(ev);

            if (ev.cancelable) {
                ev.preventDefault();
            }
        });

        // Simulate touch behavior for mouse, for example react to move events outside element

        const mouseMoveListener = (ev) => {
            this._handleInputContinue(ev, ev.clientX, ev.clientY);
        };

        const mouseUpListener = (ev) => {
            window.removeEventListener('mouseup', mouseUpListener);
            window.removeEventListener('mousemove', mouseMoveListener);

            this._handleInputEnd(ev);
        }
    
        this.addEventListener('mousedown', (ev) => {
            window.addEventListener('mousemove', mouseMoveListener);
            window.addEventListener('mouseup', mouseUpListener);

            this._handleInputStart(ev, ev.clientX, ev.clientY);
        });
    }

    _handleInputStart(originalEvent, clientX, clientY) {
        const ev = this._createControlEvent('controlstart', originalEvent);

        ev.clientX = clientX;
        ev.clientY = clientY;

        this._prevClientX = clientX;
        this._prevClientY = clientY;

        this.dispatchEvent(ev);
    }

    _handleInputContinue(originalEvent, clientX, clientY) {
        const ev = this._createControlEvent('controlcontinue', originalEvent);

        // movementX/Y is not available in TouchEvent instances

        ev.clientX = clientX;
        ev.movementX = clientX - this._prevClientX;
        this._prevClientX = clientX;

        ev.clientY = clientY;
        ev.movementY = clientY - this._prevClientY;
        this._prevClientY = clientY;

        this.dispatchEvent(ev);
    }

    _handleInputEnd(originalEvent) {
        const ev = this._createControlEvent('controlend', originalEvent);
        this.dispatchEvent(ev);
    }

    _createControlEvent(name, originalEvent) {
        const ev = new ControlEvent(name);
        ev.originalEvent = originalEvent;

        // Copy some standard properties
        ev.shiftKey = originalEvent.shiftKey;
        ev.ctrlKey = originalEvent.ctrlKey;

        return ev;
    }

}

/**
 *  Base class for stateful input widgets
 */

class InputWidget extends TouchAndMouseControllableWidget {

    /**
     *  Public
     */

    get value() {
        return this._value;
    }

    set value(value) {
        this._setValue(value);
    }

    /**
     *  Internal
     */

    constructor() {
        super();
        this._value = 0;
    }

    _setValue(value, runInternalCallback) {
        if (this._value == value) {
            return;
        }

        this._value = value;

        if (runInternalCallback !== false) {
            this._onSetValue(this._value);
        }

        const ev = new InputEvent('input');
        ev.value = this._value;
        this.dispatchEvent(ev);
    }

    _onSetValue(value) {
        // no-op
    }

}

/**
 *  Base class for widgets that hold a value within a range
 */

class RangeInputWidget extends InputWidget {

    /**
     *  Internal
     */

    constructor() {
        super();

        this._opt.minValue = this._opt.minValue || 0.0;
        this._opt.maxValue = this._opt.maxValue || 1.0;
    }

    _range() {
        return this._opt.maxValue - this._opt.minValue;
    }

    _clamp(value) {
        return Math.max(this._opt.minValue, Math.min(this._opt.maxValue, value));
    }

    _normalize(value) {
        return (value - this._opt.minValue) / this._range();
    }

    _denormalize(value) {
        return this._opt.minValue + value * this._range();
    }

}

/**
 * Support
 */

class SvgMath {

    // http://jsbin.com/quhujowota

    static describeArc(x, y, radius, startAngle, endAngle) {
        const start = this.polarToCartesian(x, y, radius, endAngle);
        const end = this.polarToCartesian(x, y, radius, startAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

        const d = [
            'M', start.x, start.y, 
            'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(' ');

        return d;       
    }

    static polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    }

}

/**
 *  Widget implementations
 */

class ResizeHandle extends InputWidget {

    /**
     *  Public
     */

    appendToBody() {
        document.body.appendChild(this);
    }
    
    /**
     *  Internal
     */

    static get _unqualifiedNodeName() {
        return 'resize-handle';
    }

    static _staticInit() {
        super._staticInit();

        this._themeSvgData = Object.freeze({
            DOTS:
               `<svg viewBox="0 0 100 100">
                    <path d="M80.5,75.499c0,2.763-2.238,5.001-5,5.001c-2.761,0-5-2.238-5-5.001c0-2.759,2.239-4.999,5-4.999
                        C78.262,70.5,80.5,72.74,80.5,75.499z"/>
                    <path d="M50.5,75.499c0,2.763-2.238,5.001-5,5.001c-2.761,0-5-2.238-5-5.001c0-2.759,2.239-4.999,5-4.999
                        C48.262,70.5,50.5,72.74,50.5,75.499z"/>
                    <path d="M80.5,45.499c0,2.763-2.238,5.001-5,5.001c-2.761,0-5-2.238-5-5.001c0-2.759,2.239-4.999,5-4.999
                        C78.262,40.5,80.5,42.74,80.5,45.499z"/>
                </svg>`
            ,
            LINES:
               `<svg viewBox="0 0 100 100">
                    <line x1="0" y1="100" x2="100" y2="0"/>
                    <line x1="100" y1="25" x2="25" y2="100"/>
                    <line x1="50" y1="100" x2="100" y2="50"/>
                    <line x1="75" y1="100" x2="100" y2="75"/>
                </svg>`
        });
    }

    _instanceInit() {
        super._instanceInit();

        // Default minimum size is the current document size
        this._opt.minWidth = this._opt.minWidth || document.body.clientWidth;
        this._opt.minHeight = this._opt.minHeight || document.body.clientHeight;

        if (this._opt.maxScale) {
            // Set the maximum size to maxScale times the minimum size 
            this._opt.maxWidth = this._opt.maxScale * this._opt.minWidth;
            this._opt.maxHeight = this._opt.maxScale * this._opt.minHeight;
        } else {
            // Default maximum size is the device screen size
            this._opt.maxWidth = this._opt.maxWidth || window.screen.width;
            this._opt.maxHeight = this._opt.maxHeight || window.screen.height;
        }

        // Keep aspect ratio while resizing, default to yes
        this._opt.keepAspectRatio = this._opt.keepAspectRatio === false ? false : true;

        // Initialize state
        this._aspectRatio = this._opt.minWidth / this._opt.minHeight;
        this._width = 0;
        this._height = 0;
        
        // No point in allowing CSS customizations for these
        this.style.position = 'fixed';
        this.style.zIndex = '1000';
        this.style.right = '0px';
        this.style.bottom = '0px';
        this.style.width = '24px';
        this.style.height = '24px';

        const svgData = this.constructor._themeSvgData;

        // Configure graphic
        switch (this._opt.theme || 'dots') {
            case 'dots':
                this.innerHTML = svgData.DOTS;
                break;
            case 'lines':
                this.innerHTML = svgData.LINES;
                break;
            default:
                break;
        }

        this.addEventListener('controlstart', this._onGrab);
        this.addEventListener('controlcontinue', this._onDrag);
    }

    _onGrab(ev) {
        this._width = document.body.clientWidth;
        this._height = document.body.clientHeight;
    }

    _onDrag(ev) {
        // FIXME: On Windows, touchmove events stop triggering after calling callback,
        //        which in turn calls DistrhoUI::setSize(). Mouse resizing works OK.
        let newWidth = this._width + ev.movementX;
        newWidth = Math.max(this._opt.minWidth, Math.min(this._opt.maxWidth, newWidth));

        let newHeight = this._height + ev.movementY;
        newHeight = Math.max(this._opt.minHeight, Math.min(this._opt.maxHeight, newHeight));

        if (this._opt.keepAspectRatio) {
            if (ev.movementX > ev.movementY) {
                newHeight = newWidth / this._aspectRatio;
            } else {
                newWidth = newHeight * this._aspectRatio;
            }
        }

        if ((this._width != newWidth) || (this._height != newHeight)) {
            this._width = newWidth;
            this._height = newHeight;
            const k = window.devicePixelRatio;
            this._setValue({width: k * this._width, height: k * this._height});
        }
    }

}

class Knob extends RangeInputWidget {

    /**
     *  Internal
     */
    
    static get _unqualifiedNodeName() {
        return 'knob';
    }

    static _staticInit() {
        super._staticInit();

        this._trackStartAngle = -135;
        this._trackEndAngle   =  135;

        this._svgData = `<svg viewBox="40 40 220 220">
                            <path class="knob-track" fill="none" stroke="#404040" stroke-width="20"/>
                            <path class="knob-value" fill="none" stroke="#ffffff" stroke-width="20"/>
                         </svg>`;
    }

    _instanceInit() {
        super._instanceInit();

        const This = this.constructor;

        this.innerHTML = This._svgData;
        this.style.display = 'block';

        const d = SvgMath.describeArc(150, 150, 100, This._trackStartAngle, This._trackEndAngle);
        this.querySelector('.knob-track').setAttribute('d', d);

        this.addEventListener('controlstart', this._onGrab);
        this.addEventListener('controlcontinue', this._onMove);
    }

    _onSetValue(value) {
        const This = this.constructor;
        const range = Math.abs(This._trackStartAngle) + Math.abs(This._trackEndAngle);
        const endAngle = This._trackStartAngle + range * this._normalize(value);
        const d = SvgMath.describeArc(150, 150, 100, This._trackStartAngle, endAngle);
        this.querySelector('.knob-value').setAttribute('d', d);
    }

    _onGrab(ev) {
        this._startValue = this._value;
        this._axisTracker = [];
        this._dragDistance = 0;
    }

    _onMove(ev) {
        const dir = Math.abs(ev.movementX) - Math.abs(ev.movementY);

        if (this._axisTracker.length < 3) {
            this._axisTracker.push(dir);
            return;
        }

        this._axisTracker.shift();
        this._axisTracker.push(dir);

        const axis = this._axisTracker.reduce((n0, n1) => n0 + n1);

        let dv;

        if (axis > 0) {
            this._dragDistance += ev.movementX;
            dv = this._range() * this._dragDistance / this.clientWidth;
        } else {
            this._dragDistance -= ev.movementY;
            dv = this._range() * this._dragDistance / this.clientHeight;
        }

        this._setValue(this._clamp(this._startValue + dv));
    }

}

{
    [ResizeHandle, Knob].forEach((cls) => cls._staticInit());
}
