// Schema Generator Code
const FIELD_TYPES = {
    STRING: 'String',
    BOOLEAN: 'Boolean',
    OBJECT: 'Object',
    REF: 'Ref',
};

const FIELD_NAMES = {
    ID: 'id',
    SLUG: 'slug',
};

const MANUAL_FILL_PLACEHOLDER = '@@@ TO BE FILLED MANUALLY @@@';
const REFERENCE_SUFFIX = 'Ref';
const REF_FIELD_NAME_SUFFIX = 'Ref';

const capitalize = (s) => {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const buildObjectName = (parentPath, objFieldName) => {
    if (!parentPath) {
        return objFieldName;
    }
    return parentPath + capitalize(objFieldName);
};

const detectArrayType = (arr) => {
    if (arr.length === 0) {
        return { type: FIELD_TYPES.STRING, valid: false };
    }
    const firstItem = arr[0];
    if (firstItem === null || firstItem === undefined) {
        return { type: FIELD_TYPES.STRING, valid: false };
    }
    switch (typeof firstItem) {
        case 'boolean':
            return { type: FIELD_TYPES.BOOLEAN, valid: true };
        case 'string':
            return { type: FIELD_TYPES.STRING, valid: true };
        case 'object':
            if (firstItem !== null && !Array.isArray(firstItem)) {
                return { type: FIELD_TYPES.OBJECT, valid: true };
            }
            return { type: FIELD_TYPES.STRING, valid: false };
        default:
            return { type: FIELD_TYPES.STRING, valid: false };
    }
};

const mergeObjectConfigs = (existing, newConfig) => {
    const result = {
        fields: { ...existing.fields },
    };
    for (const [fieldName, fieldConfig] of Object.entries(newConfig.fields)) {
        if (!(fieldName in result.fields)) {
            result.fields[fieldName] = fieldConfig;
        }
    }
    return result;
};

const createGroupConfBuilder = (source, groupName) => ({
    source,
    groupName,
    fields: {},
    objects: {},
});

const resolveRefTarget = (builder, fieldName, array) => {
    let refGroup = fieldName.replace(new RegExp(REF_FIELD_NAME_SUFFIX + '$'), '');
    if (!array) {
        if (pluralize.isSingular(refGroup)) {
            refGroup = pluralize.plural(refGroup);
        }
    }
    if (!(refGroup in builder.source)) {
        return MANUAL_FILL_PLACEHOLDER;
    }
    return refGroup;
};

const detectFieldConfig = (builder, fieldName, value) => {
    const fieldConfig = { type: FIELD_TYPES.STRING };
    if (fieldName === FIELD_NAMES.ID) {
        fieldConfig.filter = true;
        fieldConfig.required = true;
    }
    switch (typeof value) {
        case 'boolean':
            fieldConfig.type = FIELD_TYPES.BOOLEAN;
            break;
        case 'string':
            fieldConfig.type = FIELD_TYPES.STRING;
            break;
        case 'object':
            if (value === null) {
                return { config: fieldConfig, valid: false };
            }
            if (Array.isArray(value)) {
                fieldConfig.array = true;
                if (value.length === 0) {
                    return { config: fieldConfig, valid: false };
                }
                const arrayTypeResult = detectArrayType(value);
                if (!arrayTypeResult.valid) {
                    return { config: fieldConfig, valid: false };
                }
                fieldConfig.type = arrayTypeResult.type;
                if (arrayTypeResult.type === FIELD_TYPES.OBJECT) {
                    fieldConfig.objName = fieldName;
                }
            }
            else {
                fieldConfig.type = FIELD_TYPES.OBJECT;
                fieldConfig.objName = fieldName;
            }
            break;
        default:
            return { config: fieldConfig, valid: false };
    }
    if (fieldName.endsWith(REFERENCE_SUFFIX)) {
        fieldConfig.type = FIELD_TYPES.REF;
        fieldConfig.refTo = resolveRefTarget(builder, fieldName, fieldConfig.array || false);
    }
    return { config: fieldConfig, valid: true };
};

const detectGroupFields = (builder, fieldName, value) => {
    const result = detectFieldConfig(builder, fieldName, value);
    if (!result.valid) {
        return;
    }
    if (fieldName in builder.fields) {
        return;
    }
    
    // Add required and filter for slug field
    if (fieldName === FIELD_NAMES.SLUG) {
        result.config.required = true;
        result.config.filter = true;
    }
    
    builder.fields[fieldName] = result.config;
};

const analyzeObjectStructure = (builder, objFieldName, obj, parentPath) => {
    const objConfig = {
        fields: {},
    };
    for (const [fieldName, value] of Object.entries(obj)) {
        if (value === null || value === undefined) {
            continue;
        }
        const result = detectFieldConfig(builder, fieldName, value);
        if (!result.valid) {
            continue;
        }
        const detected = result.config;
        if (detected.type === FIELD_TYPES.OBJECT) {
            const nestedObjectParentPath = buildObjectName(parentPath, objFieldName);
            detected.objName = buildObjectName(nestedObjectParentPath, fieldName);
        }
        objConfig.fields[fieldName] = detected;
    }
    return objConfig;
};

const analyzeObjectStructureFromArray = (builder, fieldName, arr, parentPath) => {
    let accumulated = { fields: {} };
    for (const item of arr) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            continue;
        }
        const objStruct = analyzeObjectStructure(builder, fieldName, item, parentPath);
        accumulated = mergeObjectConfigs(accumulated, objStruct);
    }
    return accumulated;
};

const detectObjectConfig = (builder, fieldName, value, parentPath) => {
    if (typeof value !== 'object' || value === null) {
        return { config: { fields: {} }, valid: false };
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return { config: { fields: {} }, valid: false };
        }
        if (typeof value[0] !== 'object' || value[0] === null || Array.isArray(value[0])) {
            return { config: { fields: {} }, valid: false };
        }
        return {
            config: analyzeObjectStructureFromArray(builder, fieldName, value, parentPath),
            valid: true,
        };
    }
    else {
        return {
            config: analyzeObjectStructure(builder, fieldName, value, parentPath),
            valid: true,
        };
    }
};

const detectGroupObjects = (builder, fieldName, value, parentPath) => {
    if (value === null || value === undefined) {
        return;
    }
    const result = detectObjectConfig(builder, fieldName, value, parentPath);
    if (!result.valid || Object.keys(result.config.fields).length === 0) {
        return;
    }
    const fullObjName = buildObjectName(parentPath, fieldName);
    if (fullObjName in builder.objects) {
        const existing = builder.objects[fullObjName];
        builder.objects[fullObjName] = mergeObjectConfigs(existing, result.config);
    }
    else {
        builder.objects[fullObjName] = result.config;
    }
    
    if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    for (const [k, vv] of Object.entries(item)) {
                        detectGroupObjects(builder, k, vv, fullObjName);
                    }
                }
            }
        }
        else {
            for (const [k, vv] of Object.entries(value)) {
                detectGroupObjects(builder, k, vv, fullObjName);
            }
        }
    }
};

const buildGroupConfig = (builder, groupEntries) => {
    if (groupEntries.length === 0) {
        return false;
    }
    for (const gEntry of groupEntries) {
        if (Object.keys(gEntry).length === 0) {
            continue;
        }
        for (const [fieldName, value] of Object.entries(gEntry)) {
            if (value === null || value === undefined) {
                continue;
            }
            detectGroupFields(builder, fieldName, value);
            detectGroupObjects(builder, fieldName, value, '');
        }
    }
    
    // Post-process: add required and filter for name field if slug exists
    if (builder.fields.name && builder.fields.slug) {
        builder.fields.name.required = true;
        builder.fields.name.filter = true;
    }
    
    return true;
};

const generateSchemaFromData = (source) => {
    const schema = {
        namespace: MANUAL_FILL_PLACEHOLDER,
        typePrefix: MANUAL_FILL_PLACEHOLDER,
        groups: {},
    };
    for (const [groupName, groupEntries] of Object.entries(source)) {
        if (groupEntries.length === 0) {
            continue;
        }
        const builder = createGroupConfBuilder(source, groupName);
        const success = buildGroupConfig(builder, groupEntries);
        if (!success) {
            continue;
        }
        const groupConfig = {
            fields: builder.fields,
        };
        if (Object.keys(builder.objects).length > 0) {
            groupConfig.objects = builder.objects;
        }
        schema.groups[groupName] = groupConfig;
    }
    return schema;
};

const writeFieldConfigInline = (fieldConfig) => {
    const parts = [`"type": "${fieldConfig.type}"`];
    if (fieldConfig.array) {
        parts.push('"array": true');
    }
    if (fieldConfig.filter) {
        parts.push('"filter": true');
    }
    if (fieldConfig.required) {
        parts.push('"required": true');
    }
    if (fieldConfig.objName) {
        parts.push(`"objName": "${fieldConfig.objName}"`);
    }
    if (fieldConfig.refTo) {
        parts.push(`"refTo": "${fieldConfig.refTo}"`);
    }
    return `{ ${parts.join(', ')} }`;
};

const serializeToJson = (cfg) => {
    const indent = (n) => '  '.repeat(n);
    const lines = [];
    lines.push('{');
    lines.push(`${indent(1)}"namespace": "${cfg.namespace}",`);
    lines.push(`${indent(1)}"typePrefix": "${cfg.typePrefix}",`);
    lines.push(`${indent(1)}"groups": {`);
    const groupNames = Object.keys(cfg.groups).sort();
    groupNames.forEach((groupName, groupIdx) => {
        const group = cfg.groups[groupName];
        if (groupIdx > 0) {
            lines.push(',');
        }
        lines.push(`${indent(2)}"${groupName}": {`);
        lines.push(`${indent(3)}"fields": {`);
        const fieldNames = Object.keys(group.fields).sort();
        if (fieldNames.length > 0) {
            fieldNames.forEach((fieldName, fieldIdx) => {
                const fieldConfig = group.fields[fieldName];
                const comma = fieldIdx < fieldNames.length - 1 ? ',' : '';
                lines.push(`${indent(4)}"${fieldName}": ${writeFieldConfigInline(fieldConfig)}${comma}`);
            });
        }
        lines.push(`${indent(3)}}`);
        if (group.objects && Object.keys(group.objects).length > 0) {
            lines.push(',');
            lines.push(`${indent(3)}"objects": {`);
            const objNames = Object.keys(group.objects).sort();
            objNames.forEach((objName, objIdx) => {
                const obj = group.objects[objName];
                if (objIdx > 0) {
                    lines.push(',');
                }
                lines.push(`${indent(4)}"${objName}": {`);
                lines.push(`${indent(5)}"fields": {`);
                const objFieldNames = Object.keys(obj.fields).sort();
                if (objFieldNames.length > 0) {
                    objFieldNames.forEach((fieldName, fieldIdx) => {
                        const fieldConfig = obj.fields[fieldName];
                        const comma = fieldIdx < objFieldNames.length - 1 ? ',' : '';
                        lines.push(`${indent(6)}"${fieldName}": ${writeFieldConfigInline(fieldConfig)}${comma}`);
                    });
                }
                lines.push(`${indent(5)}}`);
                lines.push(`${indent(4)}}`);
            });
            lines.push(`${indent(3)}}`);
        }
        lines.push(`${indent(2)}}`);
    });
    if (groupNames.length > 0) {
        lines.push('');
    }
    lines.push(`${indent(1)}}`);
    lines.push('}');
    return lines.join('\n');
};

// Function to apply ref-config mappings
const applyRefConfig = (schema, refConfig) => {
    if (!refConfig || !refConfig.refs) return schema;

    const refMap = {};
    refConfig.refs.forEach(ref => {
        refMap[ref.from] = ref.to;
    });

    // Create a deep copy of the schema
    const result = JSON.parse(JSON.stringify(schema));

    // Iterate through groups
    Object.keys(result.groups).forEach(groupName => {
        const group = result.groups[groupName];
        
        // Check fields in the group
        if (group.fields) {
            Object.keys(group.fields).forEach(fieldName => {
                const field = group.fields[fieldName];
                const fullPath = `${groupName}.${fieldName}`;
                
                if (field.type === 'Ref' && field.refTo === MANUAL_FILL_PLACEHOLDER) {
                    if (refMap[fullPath]) {
                        field.refTo = refMap[fullPath];
                    }
                }
            });
        }
        
        // Check fields in nested objects
        if (group.objects) {
            Object.keys(group.objects).forEach(objName => {
                const obj = group.objects[objName];
                if (obj.fields) {
                    Object.keys(obj.fields).forEach(fieldName => {
                        const field = obj.fields[fieldName];
                        // For nested objects, we need to construct the path differently
                        // The path should be groupName.fieldName for the original data structure
                        const fullPath = `${groupName}.${fieldName}`;
                        
                        if (field.type === 'Ref' && field.refTo === MANUAL_FILL_PLACEHOLDER) {
                            if (refMap[fullPath]) {
                                field.refTo = refMap[fullPath];
                            }
                        }
                    });
                }
            });
        }
    });

    return result;
};

// Enhanced syntax highlighting for the output
const syntaxHighlight = (json) => {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
    }
    
    // Escape HTML
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Apply syntax highlighting
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]{}(),:])/g, function (match) {
        let className = '';
        
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                className = 'json-key'; // Property keys
            } else {
                className = 'json-string'; // String values
            }
        } else if (/true|false/.test(match)) {
            className = 'json-boolean'; // Boolean values
        } else if (/null/.test(match)) {
            className = 'json-null'; // Null values
        } else if (/^-?\d/.test(match)) {
            className = 'json-number'; // Numeric values
        } else {
            className = 'json-punctuation'; // Brackets, braces, commas, colons
        }
        
        return `<span class="${className}">${match}</span>`;
    });
};

// App Logic
let processedSchema = '';
let uploadedFileName = '';
let refConfigData = null;

const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const refConfigInput = document.getElementById('refConfigInput');
const refConfigInfo = document.getElementById('refConfigInfo');
const processBtn = document.getElementById('processBtn');
const outputDisplay = document.getElementById('outputDisplay');
const downloadBtn = document.getElementById('downloadBtn');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');

const hideMessages = () => {
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
};

const showError = (message) => {
    hideMessages();
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
};

const showSuccess = (message) => {
    hideMessages();
    successMessage.textContent = message;
    successMessage.style.display = 'block';
};

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
            showError('Please select a valid JSON file');
            processBtn.disabled = true;
            fileInfo.textContent = 'No file selected';
            return;
        }
        
        uploadedFileName = file.name;
        fileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
        processBtn.disabled = false;
        hideMessages();
    } else {
        fileInfo.textContent = 'No file selected';
        processBtn.disabled = true;
        hideMessages();
    }
});

refConfigInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
            showError('Please select a valid JSON file for ref-config');
            refConfigInfo.textContent = 'No ref-config file selected';
            refConfigData = null;
            return;
        }
        
        refConfigInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
        hideMessages();

        // Load ref config file
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                refConfigData = JSON.parse(e.target.result);
                if (!refConfigData.refs || !Array.isArray(refConfigData.refs)) {
                    throw new Error('Ref-config must contain "refs" array');
                }
                showSuccess('Ref-config loaded successfully!');
            } catch (error) {
                showError(`Error loading ref-config: ${error.message}`);
                refConfigData = null;
                refConfigInfo.textContent = 'No ref-config file selected';
            }
        };
        reader.readAsText(file);
    } else {
        refConfigInfo.textContent = 'No ref-config file selected';
        refConfigData = null;
    }
});

processBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) {
        showError('Please select a file first');
        return;
    }

    processBtn.classList.add('processing');
    processBtn.textContent = '⏳ Processing...';
    processBtn.disabled = true;
    hideMessages();

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const jsonData = JSON.parse(e.target.result);
            
            // Generate schema
            let schema = generateSchemaFromData(jsonData);
            
            // Apply ref-config if available
            if (refConfigData) {
                schema = applyRefConfig(schema, refConfigData);
            }
            
            processedSchema = serializeToJson(schema);
            
            // Display result with syntax highlighting
            outputDisplay.innerHTML = syntaxHighlight(processedSchema);
            downloadBtn.style.display = 'inline-block';
            
            showSuccess(`Schema generated successfully!${refConfigData ? ' Ref-config applied.' : ''}`);
        } catch (error) {
            showError(`Error processing file: ${error.message}`);
            outputDisplay.innerHTML = '<span class="placeholder">Error occurred during processing</span>';
            downloadBtn.style.display = 'none';
        } finally {
            processBtn.classList.remove('processing');
            processBtn.textContent = '🚀 Process Schema';
            processBtn.disabled = false;
        }
    };

    reader.onerror = () => {
        showError('Error reading file');
        processBtn.classList.remove('processing');
        processBtn.textContent = '🚀 Process Schema';
        processBtn.disabled = false;
    };

    reader.readAsText(file);
});

downloadBtn.addEventListener('click', () => {
    if (!processedSchema) {
        showError('No schema to download');
        return;
    }

    const blob = new Blob([processedSchema], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = uploadedFileName.replace('.json', '_schema.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccess('Schema downloaded successfully!');
});
