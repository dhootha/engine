pc.extend(pc.fw, function () {
    /**
     * @name pc.fw.SpotLightComponentSystem
     * @constructor Create a new SpotLightComponentSystem
     * @class A Light Component is used to dynamically light the scene.
     * @param {Object} context
     * @extends pc.fw.ComponentSystem
     */
    var SpotLightComponentSystem = function (context) {
        this.id = "spotlight";
        context.systems.add(this.id, this);

        this.ComponentType = pc.fw.SpotLightComponent;
        this.DataType = pc.fw.SpotLightComponentData;

        this.schema = [{
            name: "enable",
            displayName: "Enable",
            description: "Enable or disable the light",
            type: "boolean",
            defaultValue: true
        }, {
            name: "color",
            displayName: "Color",
            description: "Light color",
            type: "rgb",
            defaultValue: [1,1,1]
        }, {
            name: "intensity",
            displayName: "Intensity",
            description: "Factors the light color",
            type: "number",
            defaultValue: 1,
            options: {
                min: 0,
                max: 10,
                step: 0.05
            }
        }, {
            name: "attenuationEnd",
            displayName: "Attenuation End",
            description: "The distance from the light where its contribution falls to zero",
            type: "number",
            defaultValue: 10,
            options: {
                min: 0
            }
        }, {
            name: "innerConeAngle",
            displayName: "Inner Cone Angle",
            description: "Spotlight inner cone angle",
            type: "number",
            defaultValue: 40,
            options: {
                min: 0,
                max: 90
            }
        }, {
            name: "outerConeAngle",
            displayName: "Outer Cone Angle",
            description: "Spotlight outer cone angle",
            type: "number",
            defaultValue: 45,
            options: {
                min: 0,
                max: 90
            }
        }, {
            name: "castShadows",
            displayName: "Cast Shadows",
            description: "Cast shadows from this light",
            type: "boolean",
            defaultValue: false
        }, {
            name: "shadowResolution",
            displayName: "Shadow Resolution",
            description: "Resolution of shadowmap generated by this light",
            type: "enumeration",
            options: {
                enumerations: [{
                    name: '256',
                    value: 256
                }, {
                    name: '512',
                    value: 512
                }, {
                    name: '1024',
                    value: 1024
                }, {
                    name: '2048',
                    value: 2048
                }]
            },
            defaultValue: 1024
        }, {
            name: "model",
            exposed: false
        }];

        this.exposeProperties();

        // TODO: Only allocate graphics resources when running in Designer
        this.material = new pc.scene.BasicMaterial();

        var indexBuffer = new pc.gfx.IndexBuffer(context.graphicsDevice, pc.gfx.INDEXFORMAT_UINT8, 88);
        var inds = new Uint8Array(indexBuffer.lock());
        // Spot cone side lines
        inds[0] = 0;
        inds[1] = 1;
        inds[2] = 0;
        inds[3] = 11;
        inds[4] = 0;
        inds[5] = 21;
        inds[6] = 0;
        inds[7] = 31;
        // Spot cone circle - 40 segments
        for (var i = 0; i < 40; i++) {
            inds[8 + i * 2 + 0] = i + 1;
            inds[8 + i * 2 + 1] = i + 2;
        }
        indexBuffer.unlock();
        this.indexBuffer = indexBuffer;

        var format = new pc.gfx.VertexFormat();
        format.begin();
        format.addElement(new pc.gfx.VertexElement("vertex_position", 3, pc.gfx.VertexElementType.FLOAT32));
        format.end();
        this.vertexFormat = format;

        this.on('remove', this.onRemove, this);
        pc.fw.ComponentSystem.on('toolsUpdate', this.toolsUpdate, this);
    };
    SpotLightComponentSystem = pc.inherits(SpotLightComponentSystem, pc.fw.ComponentSystem);

    pc.extend(SpotLightComponentSystem.prototype, {
        initializeComponentData: function (component, data, properties) {
            var node = new pc.scene.LightNode();
            node.setName('spotlight');
            node.setType(pc.scene.LightType.SPOT);

            var model = new pc.scene.Model();
            model.graph = node;
            model.lights = [ node ];

            if (this.context.designer) {
                var vertexBuffer = new pc.gfx.VertexBuffer(this.context.graphicsDevice, this.vertexFormat, 42, pc.gfx.BUFFER_DYNAMIC);

                var mesh = new pc.scene.Mesh();
                mesh.vertexBuffer = vertexBuffer;
                mesh.indexBuffer[0] = this.indexBuffer;
                mesh.primitive[0].type = pc.gfx.PRIMITIVE_LINES;
                mesh.primitive[0].base = 0;
                mesh.primitive[0].count = this.indexBuffer.getNumIndices();
                mesh.primitive[0].indexed = true;

                model.meshInstances = [ new pc.scene.MeshInstance(node, mesh, this.material) ];
            }

            this.context.scene.addModel(model);
            component.entity.addChild(node);

            data.model = model;
            if (data.color) {
                data.color = new pc.Color(data.color);    
            }

            properties = ['model', 'enable', 'color', 'intensity', 'attenuationEnd', 'innerConeAngle', 'outerConeAngle', 'castShadows', 'shadowResolution'];
            SpotLightComponentSystem._super.initializeComponentData.call(this, component, data, properties);
        },
    
        onRemove: function (entity, data) {
            entity.removeChild(data.model.graph);
            this.context.scene.removeModel(data.model);
            delete data.model;
        },

        toolsUpdate: function (fn) {
            var components = this.store;
            for (var id in components) {
                if (components.hasOwnProperty(id)) {
                    var entity = components[id].entity;
                    var componentData = components[id].data;

                    var model = componentData.model;
                    var meshInstance = model.meshInstances[0];
                    var vertexBuffer = meshInstance.mesh.vertexBuffer;

                    var oca = Math.PI * componentData.outerConeAngle / 180;
                    var ae = componentData.attenuationEnd;
                    var y = -ae * Math.cos(oca);
                    var r = ae * Math.sin(oca);

                    var positions = new Float32Array(vertexBuffer.lock());
                    positions[0] = 0;
                    positions[1] = 0;
                    positions[2] = 0;
                    var numVerts = vertexBuffer.getNumVertices();
                    for (var i = 0; i < numVerts-1; i++) {
                        var theta = 2 * Math.PI * (i / (numVerts-2));
                        var x = r * Math.cos(theta);
                        var z = r * Math.sin(theta);
                        positions[(i+1)*3+0] = x;
                        positions[(i+1)*3+1] = y;
                        positions[(i+1)*3+2] = z;
                    }
                    vertexBuffer.unlock();
                }
            }
        }
    });

    return {
        SpotLightComponentSystem: SpotLightComponentSystem
    }; 
}());
